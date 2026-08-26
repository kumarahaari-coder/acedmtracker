"use server";

import { db } from "../db";
import {
  projects,
  projectMemberships,
  users,
  contentItems,
  submissionVersions,
  contentAssignments,
  workSessions,
  changeRequests,
  approvalDecisions,
  founderOverrides,
  attendanceRecords,
  comments,
  notifications,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { AppState } from "../types";
import { getEmptyAppState } from "../state/empty";

/**
 * Returns an authoritative initial or refreshed workspace state directly from PostgreSQL.
 * If no records exist in the organization, returns clean empty arrays.
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

    if (!orgId) {
      const [firstOrg] = await db.select().from(users).limit(1);
      if (firstOrg) orgId = firstOrg.orgId;
    }

    if (!orgId) {
      return {
        success: true,
        state: getEmptyAppState(),
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
    }

    // 1. Fetch organization projects
    const orgProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.orgId, orgId));

    // 2. Fetch project memberships
    const orgMemberships = await db
      .select()
      .from(projectMemberships)
      .where(eq(projectMemberships.orgId, orgId));

    // 3. Fetch org users
    const orgUsers = await db
      .select()
      .from(users)
      .where(eq(users.orgId, orgId));

    // 4. Fetch content items
    const orgItems = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.orgId, orgId));

    // 5. Fetch submission versions
    const orgVersions = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.orgId, orgId));

    // 6. Fetch assignments
    const orgAssignments = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.orgId, orgId));

    // 7. Fetch work sessions
    const orgSessions = await db
      .select()
      .from(workSessions)
      .where(eq(workSessions.orgId, orgId));

    // 8. Fetch attendance records
    const orgAttendance = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.orgId, orgId));

    // 9. Fetch comments
    const orgComments = await db
      .select()
      .from(comments)
      .where(eq(comments.orgId, orgId));

    // 10. Fetch notifications
    const orgNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.orgId, orgId));

    // 11. Fetch change requests
    const orgChangeRequests = await db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.orgId, orgId));

    // 12. Fetch approval decisions
    const orgDecisions = await db
      .select()
      .from(approvalDecisions)
      .where(eq(approvalDecisions.orgId, orgId));

    // 13. Fetch founder overrides
    const orgOverrides = await db
      .select()
      .from(founderOverrides)
      .where(eq(founderOverrides.orgId, orgId));

    // 14. Role-scoped filtering
    const role = authoritativeUser?.organizationRole || "designer";
    const isClient = role === "client";
    const isDesigner = role === "designer";

    let visibleProjects = orgProjects;
    let visibleMemberships = orgMemberships;
    let visibleItems = orgItems;
    let visibleUsers = orgUsers;

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
      visibleUsers = orgUsers.filter((u) => u.organizationRole !== "client");
    }

    const nowIso = new Date().toISOString();

    const mappedState: AppState = {
      projects: visibleProjects.map((p) => ({
        id: p.legacyId || p.id,
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
      projectMemberships: visibleMemberships.map((m) => {
        const proj = orgProjects.find((p) => p.id === m.projectId);
        return {
          id: m.id,
          projectId: proj?.legacyId || m.projectId,
          userId: m.userId,
          membershipRole: (m.membershipRole as any) || "designer",
          status: (m.status as any) || "active",
          addedByUserId: m.assignedByUserId || m.userId,
          addedAt: m.assignedAt ? m.assignedAt.toISOString() : nowIso,
        };
      }),
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
      contentItems: visibleItems.map((i) => ({
        id: i.id,
        projectId: i.projectId,
        title: i.title,
        platform: (i.platform as any) || "Instagram",
        contentType: (i.contentType as any) || "post",
        stage: (i.stage as any) || "draft",
        scopeClassification: (i.scopeClassification as any) || "contracted",
        currentVersionNumber: i.currentVersionNumber || 1,
        clientVisible: i.clientVisible || false,
        accountableOwnerId: "",
        collaboratorIds: [],
        deadlines: {
          submissionDeadline: i.scheduledPublicationDate ? i.scheduledPublicationDate.toISOString() : nowIso,
        },
        scheduledPublicationDate: i.scheduledPublicationDate ? i.scheduledPublicationDate.toISOString() : undefined,
        publishedAt: i.publishedAt ? i.publishedAt.toISOString() : undefined,
        liveUrl: i.liveUrl || undefined,
        createdAt: i.createdAt ? i.createdAt.toISOString() : nowIso,
        updatedAt: i.updatedAt ? i.updatedAt.toISOString() : nowIso,
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
      workSessions: orgSessions.map((w) => ({
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
      attendanceRecords: orgAttendance.map((att) => ({
        id: att.id,
        userId: att.userId,
        attendanceDate: String(att.attendanceDate),
        checkedInAt: att.checkedInAt ? att.checkedInAt.toISOString() : nowIso,
        checkedOutAt: att.checkedOutAt ? att.checkedOutAt.toISOString() : undefined,
        status: (att.status as any) || "checked_in",
        createdAt: att.createdAt ? att.createdAt.toISOString() : nowIso,
        updatedAt: att.updatedAt ? att.updatedAt.toISOString() : nowIso,
      })),
      comments: orgComments.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        contentItemId: c.contentItemId,
        submissionVersionId: c.submissionVersionId || undefined,
        parentCommentId: c.parentCommentId || undefined,
        authorUserId: c.authorUserId || undefined,
        externalReviewerName: c.externalReviewerName || undefined,
        visibility: (c.visibility as any) || "internal",
        body: c.body,
        createdAt: c.createdAt ? c.createdAt.toISOString() : nowIso,
      })),
      annotations: [],
      changeRequests: orgChangeRequests.map((cr) => ({
        id: cr.id,
        projectId: cr.projectId,
        contentItemId: cr.contentItemId,
        submissionVersionId: cr.submissionVersionId,
        component: (cr.component as any) || "creative",
        reviewerUserId: cr.reviewerUserId,
        reviewerName: "Reviewer",
        requestedChange: cr.requestedChange,
        priority: (cr.priority as any) || "medium",
        status: (cr.status as any) || "open",
        resolutionReason: cr.resolutionReason || undefined,
        resolvedByUserId: cr.resolvedByUserId || undefined,
        resolvedAt: cr.resolvedAt ? cr.resolvedAt.toISOString() : undefined,
        createdAt: cr.createdAt ? cr.createdAt.toISOString() : nowIso,
      })),
      approvalDecisions: orgDecisions.map((dec) => ({
        id: dec.id,
        projectId: dec.projectId,
        contentItemId: dec.contentItemId,
        submissionVersionId: dec.submissionVersionId,
        component: (dec.component as any) || "creative",
        componentFingerprint: dec.componentFingerprint,
        reviewerUserId: dec.reviewerUserId,
        reviewerRole: (dec.reviewerRole as any) || "founder",
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
      notifications: orgNotifs.map((n) => ({
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
      campaigns: [],
      contentFamilies: [],
      contentGroups: [],
      deadlineRecords: [],
      publicationRecords: [],
      externalReviewLinks: [],
      importBatches: [],
      scripts: [],
      assets: [],
      analyticsSnapshots: [],
      auditRecords: [],
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
