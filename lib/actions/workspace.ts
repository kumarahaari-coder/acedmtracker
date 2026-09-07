"use server";

import { db } from "../db";
import {
  projects,
  projectMemberships,
  users,
  contentGroups,
  contentItems,
  submissionVersions,
  contentAssignments,
  workSessions,
  approvalDecisions,
  founderOverrides,
  attendanceRecords,
  notifications,
  campaigns,
  scripts,
} from "../db/schema";
import { effortStandards } from "../db/schema/operational";
import { eq, and, ne, sql } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { AppState, Campaign } from "../types";
import { getEmptyAppState } from "../state/empty";
import { ExecutionProfiler } from "../observability/profiler";

export interface LayoutContextDTO {
  user: {
    id: string;
    email: string;
    fullName: string;
    organizationRole: string;
    orgId: string;
    avatarUrl?: string;
  } | null;
  projects: Array<{
    id: string;
    name: string;
    clientBrand: string;
    status: string;
  }>;
  projectMemberships: Array<{
    id: string;
    projectId: string;
    userId: string;
    membershipRole: string;
    status: string;
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    avatarUrl?: string | null;
  }>;
  unreadNotificationsCount: number;
}

/**
 * Lightweight, bounded layout hydration action.
 * Returns ONLY the authenticated user, accessible projects (for Header dropdown),
 * active memberships (for client guard), and unread notification count.
 * Never queries or downloads operational content items, versions, or assignments.
 */
export async function getAuthoritativeLayoutContextAction(): Promise<{
  success: boolean;
  context?: LayoutContextDTO;
  error?: string;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeLayoutContextAction");
  try {
    let authoritativeUser = await getAuthoritativeUser();
    profiler.mark("auth-resolution");

    if (!authoritativeUser) {
      profiler.logSummary();
      return {
        success: true,
        context: {
          user: null,
          projects: [],
          projectMemberships: [],
          users: [],
          unreadNotificationsCount: 0,
        },
      };
    }

    const orgId = authoritativeUser.orgId;
    const isClient = authoritativeUser.organizationRole === "client";

    // 4 small indexed queries
    const [projectRows, membershipRows, userRows, [notifCountRow]] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          clientBrand: projects.clientName,
          status: projects.status,
        })
        .from(projects)
        .where(and(eq(projects.orgId, orgId), eq(projects.status, "active"))),
      db
        .select({
          id: projectMemberships.id,
          projectId: projectMemberships.projectId,
          userId: projectMemberships.userId,
          membershipRole: projectMemberships.membershipRole,
          status: projectMemberships.status,
        })
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.orgId, orgId),
            eq(projectMemberships.status, "active"),
            isClient ? eq(projectMemberships.userId, authoritativeUser.id) : sql`true`
          )
        ),
      db
        .select({
          id: users.id,
          name: users.fullName,
          email: users.email,
          role: users.organizationRole,
          status: users.status,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(and(eq(users.orgId, orgId), ne(users.status, "deleted"))),
      db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.orgId, orgId),
            eq(notifications.recipientUserId, authoritativeUser.id),
            sql`${notifications.readAt} IS NULL`
          )
        ),
    ]);

    profiler.mark("queries", projectRows.length + membershipRows.length + userRows.length);

    let accessibleProjects = projectRows;
    let accessibleUsers = userRows;

    if (isClient) {
      const allowedProjIds = new Set(membershipRows.map((m) => m.projectId));
      accessibleProjects = projectRows.filter((p) => allowedProjIds.has(p.id));

      const allowedUserIds = new Set(membershipRows.map((m) => m.userId));
      allowedUserIds.add(authoritativeUser.id);
      accessibleUsers = userRows.filter((u) => allowedUserIds.has(u.id));
    }

    const context: LayoutContextDTO = {
      user: {
        id: authoritativeUser.id,
        email: authoritativeUser.email,
        fullName: authoritativeUser.fullName || authoritativeUser.email,
        organizationRole: authoritativeUser.organizationRole,
        orgId: authoritativeUser.orgId,
        avatarUrl: undefined,
      },
      projects: accessibleProjects,
      projectMemberships: membershipRows,
      users: accessibleUsers,
      unreadNotificationsCount: notifCountRow?.count || 0,
    };

    profiler.mark("dto-assembly");
    profiler.logSummary();

    return { success: true, context };
  } catch (err: any) {
    console.error("[getAuthoritativeLayoutContextAction] error:", err);
    return { success: false, error: err.message || "Failed to load layout context" };
  }
}

/**
 * Returns an authoritative initial or refreshed workspace state directly from PostgreSQL.
 * Optimized for edge runtime and high-concurrency Cloudflare Worker limits using
 * parallel batch querying (Promise.all) and lean global payload scoping.
 */
export async function getAuthoritativeWorkspaceStateAction(actorUserId?: string): Promise<{
  success: boolean;
  state: AppState;
  user?: {
    id: string;
    email: string;
    fullName: string;
    organizationRole: string;
    orgId: string;
    avatarUrl?: string;
  } | null;
  error?: string;
}> {
  try {
    let orgId = "";
    let authoritativeUser: any = null;

    // 1. Try to resolve from active Auth.js session first
    try {
      const { auth } = await import("../../auth");
      const session = await auth();
      if (session?.user?.email) {
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.normalizedEmail, session.user.email.toLowerCase().trim()))
          .limit(1);
        if (dbUser && dbUser.status === "active") {
          authoritativeUser = dbUser;
          orgId = dbUser.orgId;
        }
      }
    } catch (sessionErr) {
      // Non-edge / vitest environment where auth() is not active
    }

    if (!authoritativeUser && actorUserId) {
      authoritativeUser = await getAuthoritativeUser(actorUserId);
      if (authoritativeUser) {
        orgId = authoritativeUser.orgId;
      }
    }

    if (!authoritativeUser || !orgId) {
      return {
        success: false,
        error: "Unauthorized: No authenticated user session found.",
        state: getEmptyAppState(),
        user: null,
      };
    }

    const todayISTDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const isUuid = authoritativeUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authoritativeUser.id);

    // 2. Fetch all essential workspace entities in parallel (1 multiplexed round-trip)
    const [
      orgProjects,
      orgMemberships,
      orgUsers,
      orgGroups,
      orgItems,
      orgVersions,
      orgAssignments,
      activeSessions,
      todayAttendance,
      userNotifs,
      orgDecisions,
      orgOverrides,
      orgCampaigns,
      orgEffortStandards,
      orgScripts,
    ] = await Promise.all([
      db.select().from(projects).where(eq(projects.orgId, orgId)),
      db.select().from(projectMemberships).where(eq(projectMemberships.orgId, orgId)),
      db.select().from(users).where(eq(users.orgId, orgId)),
      db.select().from(contentGroups).where(eq(contentGroups.orgId, orgId)),
      db.select().from(contentItems).where(eq(contentItems.orgId, orgId)),
      db.select().from(submissionVersions).where(eq(submissionVersions.orgId, orgId)),
      db.select().from(contentAssignments).where(eq(contentAssignments.orgId, orgId)),
      db.select().from(workSessions).where(and(eq(workSessions.orgId, orgId), eq(workSessions.status, "active"))),
      db.select().from(attendanceRecords).where(and(eq(attendanceRecords.orgId, orgId), eq(attendanceRecords.attendanceDate, todayISTDate))),
      isUuid
        ? db.select().from(notifications).where(and(eq(notifications.orgId, orgId), eq(notifications.recipientUserId, authoritativeUser.id))).limit(20)
        : Promise.resolve([]),
      db.select().from(approvalDecisions).where(eq(approvalDecisions.orgId, orgId)),
      db.select().from(founderOverrides).where(eq(founderOverrides.orgId, orgId)),
      db.select().from(campaigns).where(eq(campaigns.orgId, orgId)),
      db.select().from(effortStandards).where(and(eq(effortStandards.orgId, orgId), eq(effortStandards.active, true))),
      db.select().from(scripts).where(eq(scripts.orgId, orgId)),
    ]);

    // 3. Role-scoped filtering
    const role = authoritativeUser.organizationRole;
    const isClient = role === "client";
    const isDesigner = role === "designer";

    let visibleProjects = orgProjects;
    let visibleMemberships = orgMemberships;
    let visibleItems = orgItems;
    let visibleUsers = orgUsers;
    let visibleGroups = orgGroups;

    if (isClient) {
      // Clients only see assigned projects & approved content
      const clientActiveMemberships = orgMemberships.filter(
        (m) => m.userId === authoritativeUser.id && m.status === "active"
      );
      const allowedProjIdSet = new Set(clientActiveMemberships.map((m) => m.projectId));
      visibleProjects = orgProjects.filter((p) => allowedProjIdSet.has(p.id));
      visibleMemberships = clientActiveMemberships;
      visibleItems = orgItems.filter(
        (i) => allowedProjIdSet.has(i.projectId) && (i.stage === "approved" || i.stage === "scheduled" || i.stage === "published")
      );
      visibleGroups = orgGroups.filter((g) => allowedProjIdSet.has(g.projectId));
      // Strictly expose only client self to prevent internal directory leakage
      visibleUsers = orgUsers.filter((u) => u.id === authoritativeUser.id);
    } else if (isDesigner) {
      // Designers only see projects they are assigned to
      const designerMemberships = orgMemberships.filter(
        (m) => m.userId === authoritativeUser.id && m.status === "active"
      );
      const allowedProjIdSet = new Set(designerMemberships.map((m) => m.projectId));
      visibleProjects = orgProjects.filter((p) => allowedProjIdSet.has(p.id));
      visibleMemberships = orgMemberships.filter((m) => allowedProjIdSet.has(m.projectId));
      visibleItems = orgItems.filter((i) => allowedProjIdSet.has(i.projectId));
      visibleGroups = orgGroups.filter((g) => allowedProjIdSet.has(g.projectId));
      visibleUsers = orgUsers.filter((u) => u.organizationRole !== "client");
    }

    const nowIso = new Date().toISOString();

    const mappedState: AppState = {
      projects: visibleProjects.map((p) => ({
        id: p.id,
        name: p.name,
        clientBrand: p.clientName,
        avatar: p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "PR",
        scope: "Deliverables & Campaigns",
        timezone: "Asia/Kolkata",
        status: (p.status as any) || "active",
        targetRequirements: { posts: 10, carousels: 4, reels: 4, trialReels: 2 },
        workflowStages: ["draft", "submitted", "in_review", "changes_requested", "approved", "scheduled", "published"],
        createdAt: p.createdAt ? p.createdAt.toISOString() : nowIso,
      })),
      projectMemberships: visibleMemberships.map((m) => ({
        id: m.id,
        projectId: m.projectId,
        userId: m.userId,
        membershipRole: (m.membershipRole as any) || "designer",
        status: (m.status as any) || "active",
        addedByUserId: m.assignedByUserId || m.userId,
        addedAt: m.assignedAt ? m.assignedAt.toISOString() : nowIso,
      })),
      users: visibleUsers.map((u) => ({
        id: u.id,
        name: u.fullName,
        email: u.email,
        role: (u.organizationRole as any) || "designer",
        status: (u.status as any) || "active",
        avatar: u.avatarUrl || u.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U",
        dateJoined: u.createdAt ? u.createdAt.toISOString().split("T")[0] : nowIso.split("T")[0],
        createdAt: u.createdAt ? u.createdAt.toISOString() : nowIso,
        updatedAt: u.updatedAt ? u.updatedAt.toISOString() : nowIso,
      })),
      contentItems: visibleItems.map((i) => {
        const itemAssignments = orgAssignments.filter(
          (a) => a.contentItemId === i.id && a.status !== "reassigned"
        );
        const primaryAssignment = itemAssignments[0];
        const activeDraft = orgVersions.find((v) => v.contentItemId === i.id && v.isDraft);
        const latestSubmitted = orgVersions
          .filter((v) => v.contentItemId === i.id && !v.isDraft)
          .sort((a, b) => b.versionNumber - a.versionNumber)[0];

        const schedDateStr = i.scheduledPublicationDate ? i.scheduledPublicationDate.toISOString() : undefined;
        const subDeadlineStr = i.submissionDeadline
          ? i.submissionDeadline.toISOString()
          : (schedDateStr || nowIso);

        return {
          id: i.id,
          projectId: i.projectId,
          contentGroupId: i.contentGroupId || undefined,
          title: i.title,
          platform: (i.platform as any) || "Instagram",
          contentType: (i.contentType as any) || "post",
          workType: i.workType || undefined,
          workTypeId: i.workTypeId || undefined,
          contentPillar: i.contentPillar || undefined,
          topic: i.topic || undefined,
          brief: i.brief || undefined,
          referenceLink: i.referenceLink || undefined,
          priority: (i.priority as any) || "normal",
          workNature: (i.workNature as any) || "planned",
          accountOwnerId: i.accountOwnerId || undefined,
          stage: (i.stage as any) || "draft",
          scopeClassification: (i.scopeClassification as any) || "contracted",
          currentVersionNumber: i.currentVersionNumber || 1,
          activeDraftVersionId: activeDraft?.id,
          latestSubmittedVersionId: latestSubmitted?.id,
          clientVisible: i.clientVisible || false,
          accountableOwnerId: primaryAssignment?.assigneeUserId || "",
          collaboratorIds: [],
          deadlines: {
            submissionDeadline: subDeadlineStr,
            resubmissionDeadline: i.resubmissionDeadline ? i.resubmissionDeadline.toISOString() : undefined,
            approvalTarget: i.approvalTarget ? i.approvalTarget.toISOString() : undefined,
            scheduledPublicationDate: schedDateStr,
          },
          calculatedInternalDeadline: i.calculatedInternalDeadline ? i.calculatedInternalDeadline.toISOString() : undefined,
          finalInternalDeadline: i.finalInternalDeadline ? i.finalInternalDeadline.toISOString() : undefined,
          deadlineOverrideReason: i.deadlineOverrideReason || undefined,
          standardContentSeconds: i.standardContentSeconds ?? undefined,
          standardProductionSeconds: i.standardProductionSeconds ?? undefined,
          revisionContentSeconds: i.revisionContentSeconds ?? undefined,
          revisionProductionSeconds: i.revisionProductionSeconds ?? undefined,
          finalPlannedSeconds: i.finalPlannedSeconds ?? undefined,
          isEffortAnchor: i.isEffortAnchor ?? false,
          completedAt: i.completedAt ? i.completedAt.toISOString() : undefined,
          scheduledPublicationDate: schedDateStr,
          publishedAt: i.publishedAt ? i.publishedAt.toISOString() : undefined,
          liveUrl: i.liveUrl || undefined,
          createdAt: i.createdAt ? i.createdAt.toISOString() : nowIso,
          updatedAt: i.updatedAt ? i.updatedAt.toISOString() : nowIso,
        };
      }),
      contentGroups: visibleGroups.map((g) => ({
        id: g.id,
        projectId: g.projectId,
        title: g.title,
        description: g.description || undefined,
        conceptNotes: g.conceptNotes || undefined,
        contentItemIds: orgItems.filter((i) => i.contentGroupId === g.id).map((i) => i.id),
        createdByUserId: g.createdByUserId,
        createdAt: g.createdAt ? g.createdAt.toISOString() : nowIso,
        updatedAt: g.updatedAt ? g.updatedAt.toISOString() : nowIso,
      })),
      submissionVersions: orgVersions.map((v) => ({
        id: v.id,
        contentItemId: v.contentItemId,
        versionNumber: v.versionNumber,
        isDraft: v.isDraft,
        copy: { caption: v.caption, hashtags: v.hashtags || [], cta: v.cta },
        creativeAssets: [],
        componentFingerprints: {
          copyFingerprint: v.copyFingerprint,
          creativeFingerprint: v.creativeFingerprint,
          postingDateFingerprint: v.postingDateFingerprint,
        },
        submittedAt: v.submittedAt ? v.submittedAt.toISOString() : undefined,
        createdAt: v.createdAt ? v.createdAt.toISOString() : nowIso,
      })),
      contentAssignments: orgAssignments.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        contentItemId: a.contentItemId,
        assigneeUserId: a.assigneeUserId,
        assignmentRole: (a.assignmentRole as any) || "designer",
        status: (a.status as any) || "assigned",
        assignedByUserId: a.assignedByUserId,
        assignedAt: a.assignedAt ? a.assignedAt.toISOString() : nowIso,
        acceptedAt: a.acceptedAt ? a.acceptedAt.toISOString() : undefined,
        startedAt: a.startedAt ? a.startedAt.toISOString() : undefined,
        completedAt: a.completedAt ? a.completedAt.toISOString() : undefined,
        initialDueAt: a.initialDueAt.toISOString(),
        currentDueAt: a.currentDueAt.toISOString(),
        reassignmentReason: a.reassignmentReason || undefined,
        replacedAssignmentId: a.replacedAssignmentId || undefined,
        createdAt: a.createdAt ? a.createdAt.toISOString() : nowIso,
        updatedAt: a.updatedAt ? a.updatedAt.toISOString() : nowIso,
      })),
      workSessions: activeSessions.map((w) => ({
        id: w.id,
        projectId: w.projectId,
        contentItemId: w.contentItemId,
        assignmentId: w.assignmentId,
        userId: w.userId,
        startedAt: w.startedAt ? w.startedAt.toISOString() : nowIso,
        endedAt: w.endedAt ? w.endedAt.toISOString() : undefined,
        accumulatedSeconds: w.accumulatedSeconds,
        activeSegmentStartedAt: w.activeSegmentStartedAt ? w.activeSegmentStartedAt.toISOString() : undefined,
        status: (w.status as any) || "active",
        notes: w.notes || undefined,
        adjustments: [],
        createdAt: w.createdAt ? w.createdAt.toISOString() : nowIso,
        updatedAt: w.updatedAt ? w.updatedAt.toISOString() : nowIso,
      })),
      attendanceRecords: todayAttendance.map((att) => ({
        id: att.id,
        userId: att.userId,
        attendanceDate: String(att.attendanceDate),
        checkedInAt: att.checkedInAt ? att.checkedInAt.toISOString() : nowIso,
        checkedOutAt: att.checkedOutAt ? att.checkedOutAt.toISOString() : undefined,
        status: (att.status as any) || "checked_in",
        createdAt: att.createdAt ? att.createdAt.toISOString() : nowIso,
        updatedAt: att.updatedAt ? att.updatedAt.toISOString() : nowIso,
      })),
      comments: [],
      annotations: [],
      changeRequests: [],
      approvalDecisions: orgDecisions.map((dec) => ({
        id: dec.id,
        projectId: dec.projectId,
        contentItemId: dec.contentItemId,
        submissionVersionId: dec.submissionVersionId,
        component: (dec.component as any) || "creative",
        componentFingerprint: dec.componentFingerprint,
        reviewerUserId: dec.reviewerUserId,
        reviewerRole: dec.reviewerRole as any,
        decision: (dec.decision as any) || "approved",
        note: dec.note || undefined,
        decidedAt: dec.decidedAt ? dec.decidedAt.toISOString() : nowIso,
        revokedAt: dec.revokedAt ? dec.revokedAt.toISOString() : undefined,
        revocationReason: dec.revocationReason || undefined,
        revokedByUserId: dec.revokedByUserId || undefined,
      })),
      founderOverrides: orgOverrides.map((ovr) => ({
        id: ovr.id,
        projectId: ovr.projectId,
        contentItemId: ovr.contentItemId,
        submissionVersionId: ovr.submissionVersionId,
        component: (ovr.component as any) || undefined,
        reason: ovr.reason,
        actorUserId: ovr.actorUserId,
        createdAt: ovr.createdAt ? ovr.createdAt.toISOString() : nowIso,
      })),
      notifications: userNotifs.map((n) => ({
        id: n.id,
        projectId: n.projectId,
        recipientUserId: n.recipientUserId,
        title: n.title,
        message: n.message,
        type: "info" as any,
        eventType: (n.eventType as any) || "status_change",
        entityType: (n.entityType as any) || "content_item",
        entityId: n.entityId,
        readAt: n.readAt ? n.readAt.toISOString() : undefined,
        createdAt: n.createdAt ? n.createdAt.toISOString() : nowIso,
      })),
      campaigns: orgCampaigns.map((c): Campaign => ({
        id: c.id,
        projectId: c.projectId,
        name: c.name,
        objective: c.objective || "",
        description: c.description || "",
        status: (c.status as any) || "planning",
        startDate: c.startDate ? c.startDate.toISOString() : undefined,
        endDate: c.endDate ? c.endDate.toISOString() : undefined,
        ownerId: c.ownerId || "",
      })),
      contentFamilies: [],
      deadlineRecords: [],
      publicationRecords: [],
      externalReviewLinks: [],
      importBatches: [],
      scripts: orgScripts.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        campaignId: s.campaignId || undefined,
        linkedContentItemId: s.linkedContentItemId || undefined,
        title: s.title,
        platform: s.platform as any,
        status: s.status as any,
        hook: s.hook,
        scenes: (s.scenes as any) || [],
        cta: s.cta,
        notes: s.notes,
        musicTrack: s.musicTrack || undefined,
        musicUrl: s.musicUrl || undefined,
        createdAt: s.createdAt ? s.createdAt.toISOString() : nowIso,
        updatedAt: s.updatedAt ? s.updatedAt.toISOString() : nowIso,
      })),
      assets: [],
      analyticsSnapshots: [],
      auditRecords: [],
      effortStandards: orgEffortStandards.map((e) => ({
        id: e.id,
        orgId: e.orgId,
        category: e.category,
        workType: e.workType,
        contentSeconds: e.contentSeconds,
        productionSeconds: e.productionSeconds,
        totalSeconds: e.totalSeconds,
        leadTimeWorkdays: e.leadTimeWorkdays,
        defaultRole: e.defaultRole,
        active: e.active,
        version: e.version,
        effectiveFrom: e.effectiveFrom.toISOString(),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      employeeCapacitySchedules: [],
      capacityAdjustments: [],
      projectCommitments: [],
      projectPerformanceInputs: [],
    };

    return {
      success: true,
      state: mappedState,
      user: authoritativeUser
        ? {
            id: authoritativeUser.id,
            email: authoritativeUser.email,
            fullName: authoritativeUser.fullName,
            organizationRole: authoritativeUser.organizationRole,
            orgId: authoritativeUser.orgId,
            avatarUrl: authoritativeUser.avatarUrl || undefined,
          }
        : null,
    };
  } catch (err: any) {
    console.error("Failed to fetch authoritative workspace state:", err);
    return {
      success: false,
      state: getEmptyAppState(),
      error: err.message,
    };
  }
}
