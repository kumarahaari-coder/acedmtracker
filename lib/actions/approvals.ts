"use server";

import { db } from "../db";
import { projects, contentItems, contentAssignments, users, projectMemberships, approvalDecisions, submissionVersions, founderOverrides } from "../db/schema";
import { eq, and, sql, isNull, isNotNull, inArray, desc } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { resolveProjectId } from "../compat/resolver";
import { ExecutionProfiler } from "../observability/profiler";
import { ContentPlatform, ContentType, ContentStage, ScopeClassification } from "../types";

export interface OrganizationApprovalItem {
  id: string;
  projectId: string;
  projectName: string;
  clientBrand: string;
  title: string;
  platform: string;
  contentType: string;
  stage: string;
  currentVersionNumber: number;
  assignedOwnerId?: string;
  assignedOwnerName?: string;
  assignedOwnerAvatar?: string;
  submissionDeadline?: string;
  approvalTarget?: string;
  copyApprovalStatus: "approved" | "changes_requested" | "pending";
  creativeApprovalStatus: "approved" | "changes_requested" | "pending";
  postingDateApprovalStatus: "approved" | "changes_requested" | "pending";
  consultantStatus: "approved" | "changes_requested" | "pending";
  founderStatus: "approved" | "changes_requested" | "pending";
  overallStatus: "approved" | "in_review" | "changes_requested" | "draft";
}

export async function getAuthoritativeOrganizationApprovalsAction(actorUserId?: string): Promise<{
  success: boolean;
  items: OrganizationApprovalItem[];
  projects: Array<{ id: string; name: string }>;
  teamMembers: Array<{ id: string; name: string }>;
  error?: string;
}> {
  try {
    const user = await getAuthoritativeUser(actorUserId);
    if (!user || user.status !== "active") {
      return { success: false, items: [], projects: [], teamMembers: [], error: "Unauthorized: Active session required" };
    }

    const orgId = user.orgId;
    if (!orgId) {
      return { success: false, items: [], projects: [], teamMembers: [], error: "Unauthorized: Invalid organization context" };
    }

    const isClient = user.organizationRole === "client";
    const isDesigner = user.organizationRole === "designer";

    // 1. Fetch organization projects, memberships, content, assignments, and approval decisions
    const [allProjects, allMemberships, allUsers, allItems, allAssignments, allDecisions] = await Promise.all([
      db.select().from(projects).where(eq(projects.orgId, orgId)),
      db.select().from(projectMemberships).where(eq(projectMemberships.orgId, orgId)),
      db.select().from(users).where(eq(users.orgId, orgId)),
      db.select().from(contentItems).where(eq(contentItems.orgId, orgId)),
      db.select().from(contentAssignments).where(eq(contentAssignments.orgId, orgId)),
      db.select().from(approvalDecisions).where(eq(approvalDecisions.orgId, orgId)),
    ]);

    // 2. Role-based scoping
    let visibleProjects = allProjects;
    if (isClient) {
      const clientMemberships = allMemberships.filter((m) => m.userId === user.id && m.status === "active");
      const clientProjIds = new Set(clientMemberships.map((m) => m.projectId));
      visibleProjects = allProjects.filter((p) => clientProjIds.has(p.id));
    } else if (isDesigner) {
      const designerMemberships = allMemberships.filter((m) => m.userId === user.id && m.status === "active");
      const designerProjIds = new Set(designerMemberships.map((m) => m.projectId));
      visibleProjects = allProjects.filter((p) => designerProjIds.has(p.id));
    }

    const visibleProjIdSet = new Set(visibleProjects.map((p) => p.id));
    const projMap = new Map(visibleProjects.map((p) => [p.id, p]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const filteredItems = allItems.filter((i) => visibleProjIdSet.has(i.projectId));

    const mappedItems: OrganizationApprovalItem[] = filteredItems.map((item) => {
      const proj = projMap.get(item.projectId);
      const activeAssignments = allAssignments.filter(
        (a) => a.contentItemId === item.id && (a.status === "assigned" || a.status === "accepted" || a.status === "in_progress")
      );
      const primaryAssignment = activeAssignments[0];
      const assigneeUser = primaryAssignment ? userMap.get(primaryAssignment.assigneeUserId) : undefined;

      const itemDecisions = allDecisions.filter((d) => d.contentItemId === item.id);
      
      const copyDecisions = itemDecisions.filter((d) => d.component === "copy");
      const creativeDecisions = itemDecisions.filter((d) => d.component === "creative");
      const dateDecisions = itemDecisions.filter((d) => d.component === "posting_date");

      const resolveCompStatus = (decs: typeof itemDecisions) => {
        if (decs.some((d) => d.decision === "rejected" || d.decision === "changes_requested")) return "changes_requested";
        if (decs.some((d) => d.decision === "approved")) return "approved";
        return "pending";
      };

      const copyStatus = resolveCompStatus(copyDecisions);
      const creativeStatus = resolveCompStatus(creativeDecisions);
      const postingDateStatus = resolveCompStatus(dateDecisions);

      const consultantDecisions = itemDecisions.filter((d) => {
        const u = userMap.get(d.reviewerUserId);
        return u?.organizationRole === "consultant";
      });
      const founderDecisions = itemDecisions.filter((d) => {
        const u = userMap.get(d.reviewerUserId);
        return u?.organizationRole === "founder" || u?.organizationRole === "admin";
      });

      const consultantStatus = resolveCompStatus(consultantDecisions);
      const founderStatus = resolveCompStatus(founderDecisions);

      let overallStatus: "approved" | "in_review" | "changes_requested" | "draft" = "draft";
      if (item.stage === "approved" || item.stage === "scheduled" || item.stage === "published") {
        overallStatus = "approved";
      } else if (item.stage === "changes_requested") {
        overallStatus = "changes_requested";
      } else if (item.stage === "in_review" || item.stage === "submitted") {
        overallStatus = "in_review";
      }

      return {
        id: item.id,
        projectId: item.projectId,
        projectName: proj?.name || "Unknown Project",
        clientBrand: proj?.clientName || proj?.name || "",
        title: item.title,
        platform: item.platform,
        contentType: item.contentType,
        stage: item.stage,
        currentVersionNumber: item.currentVersionNumber,
        assignedOwnerId: assigneeUser?.id || undefined,
        assignedOwnerName: assigneeUser?.fullName || undefined,
        assignedOwnerAvatar: assigneeUser?.avatarUrl || undefined,
        submissionDeadline: item.submissionDeadline ? item.submissionDeadline.toISOString() : undefined,
        approvalTarget: item.approvalTarget ? item.approvalTarget.toISOString() : undefined,
        copyApprovalStatus: copyStatus as any,
        creativeApprovalStatus: creativeStatus as any,
        postingDateApprovalStatus: postingDateStatus as any,
        consultantStatus: consultantStatus as any,
        founderStatus: founderStatus as any,
        overallStatus,
      };
    });

    return {
      success: true,
      items: mappedItems,
      projects: visibleProjects.map((p) => ({ id: p.id, name: p.name })),
      teamMembers: allUsers.filter((u) => u.status === "active").map((u) => ({ id: u.id, name: u.fullName })),
    };
  } catch (error: any) {
    return { success: false, items: [], projects: [], teamMembers: [], error: error.message };
  }
}

export async function recordApprovalDecisionAction(params: {
  actorUserId: string;
  submissionVersionId: string;
  component: string;
  decision: "approved" | "changes_requested" | "pending";
  note?: string;
}) {
  try {
    const reviewer = await getAuthoritativeUser(params.actorUserId);
    if (!reviewer) return { success: false, error: "Unauthorized" };

    const [version] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, params.submissionVersionId)).limit(1);
    if (!version) return { success: false, error: "Submission version not found" };

    const [decisionRow] = await db
      .insert(approvalDecisions)
      .values({
        projectId: version.projectId,
        orgId: version.orgId,
        contentItemId: version.contentItemId,
        submissionVersionId: version.id,
        component: params.component,
        componentFingerprint: "fp_" + Math.random().toString(36).substring(2, 9),
        reviewerUserId: reviewer.id,
        reviewerRole: reviewer.organizationRole,
        decision: params.decision,
        note: params.note || null,
        decidedAt: new Date(),
      })
      .returning();

    return { success: true, decision: decisionRow };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function revokeApprovalDecisionAction(params: {
  actorUserId: string;
  decisionId: string;
  reason?: string;
}) {
  try {
    const actor = await getAuthoritativeUser(params.actorUserId);
    if (!actor) return { success: false, error: "Unauthorized" };

    const [updated] = await db
      .update(approvalDecisions)
      .set({
        revokedAt: new Date(),
        revocationReason: params.reason || "Decision revoked",
        revokedByUserId: actor.id,
      })
      .where(eq(approvalDecisions.id, params.decisionId))
      .returning();

    return { success: true, decision: updated };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function recordFounderOverrideAction(params: {
  actorUserId: string;
  contentItemId: string;
  overrideType?: string;
  justification?: string;
  reason?: string;
  submissionVersionId?: string;
}) {
  try {
    const actor = await getAuthoritativeUser(params.actorUserId);
    if (!actor || (actor.organizationRole !== "founder" && actor.organizationRole !== "admin")) {
      return { success: false, error: "Unauthorized: Founder or Admin access required" };
    }

    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, params.contentItemId)).limit(1);
    if (!item) return { success: false, error: "Content item not found" };

    let versionId = params.submissionVersionId;
    if (!versionId) {
      const [latestVersion] = await db
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.contentItemId, item.id))
        .limit(1);
      versionId = latestVersion?.id;
    }

    if (!versionId) {
      const [newVersion] = await db
        .insert(submissionVersions)
        .values({
          projectId: item.projectId,
          orgId: item.orgId,
          contentItemId: item.id,
          versionNumber: 1,
          createdByUserId: actor.id,
        })
        .returning();
      versionId = newVersion.id;
    }

    const [override] = await db
      .insert(founderOverrides)
      .values({
        projectId: item.projectId,
        orgId: item.orgId,
        contentItemId: item.id,
        submissionVersionId: versionId,
        component: params.overrideType || null,
        reason: params.justification || params.reason || "Founder override executed",
        actorUserId: actor.id,
      })
      .returning();

    return { success: true, override };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface ApprovalQueueItemDTO {
  id: string;
  projectId: string;
  title: string;
  platform: ContentPlatform;
  contentType: ContentType;
  stage: ContentStage;
  currentVersionNumber: number;
  scheduledPublicationDate?: string | null;
  submissionDeadline?: string | null;
  scopeClassification: ScopeClassification;
  summary: {
    allComponentsApproved: boolean;
    anyChangesRequested: boolean;
    copy: { isFullyApproved: boolean; hasChangesRequested: boolean };
    creative: { isFullyApproved: boolean; hasChangesRequested: boolean };
    posting_date: { isFullyApproved: boolean; hasChangesRequested: boolean };
  };
  latestSubmittedVersionId?: string;
  activeDraftVersionId?: string;
}

export interface ProjectApprovalQueueDTO {
  project: {
    id: string;
    name: string;
    clientBrand: string;
  };
  counts: {
    all: number;
    pending: number;
    changes_requested: number;
    approved: number;
  };
  items: ApprovalQueueItemDTO[];
  projectMembers: Array<{
    userId: string;
    name: string;
    role: string;
  }>;
}

/**
 * Authoritative, Project-Scoped Approval Queue Query.
 * Strictly bounded by projectId.
 * Enforces canonical review eligibility:
 * 1. content_items.project_id = projectId
 * 2. content_items.deleted_at IS NULL
 * 3. stage != 'draft' AND stage != 'idea'
 * 4. At least one immutable submitted version exists (submitted_at IS NOT NULL and is_draft = false)
 * Never depends on global AppState.
 */
export async function getAuthoritativeProjectApprovalQueueAction(
  projectId: string,
  filter: "all" | "pending" | "changes_requested" | "approved" = "pending",
  actorUserId?: string
): Promise<{
  success: boolean;
  data?: ProjectApprovalQueueDTO;
  error?: string;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeProjectApprovalQueueAction");

  try {
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) {
      return { success: false, error: "Unauthorized" };
    }
    profiler.mark("auth-resolution");

    if (!projectId) {
      return { success: false, error: "Missing projectId" };
    }

    const resolvedProjId = (await resolveProjectId(projectId)) || projectId;
    const isClient = authUser.organizationRole === "client";
    const orgId = authUser.orgId;

    // 1. Fetch project & check access
    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientBrand: projects.clientName,
      })
      .from(projects)
      .where(and(eq(projects.id, resolvedProjId), eq(projects.orgId, orgId)))
      .limit(1);

    if (!project) {
      return { success: false, error: "Project not found or inaccessible" };
    }

    if (isClient) {
      const [membership] = await db
        .select({ id: projectMemberships.id })
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.projectId, resolvedProjId),
            eq(projectMemberships.userId, authUser.id),
            eq(projectMemberships.status, "active")
          )
        )
        .limit(1);

      if (!membership) {
        return { success: false, error: "Access denied to this project" };
      }
    }

    // 2. Query candidates: active, non-deleted, non-draft deliverables for this project
    const [candidateItems, memberRows, decisionRows, overrideRows] = await Promise.all([
      db
        .select({
          id: contentItems.id,
          projectId: contentItems.projectId,
          title: contentItems.title,
          platform: contentItems.platform,
          contentType: contentItems.contentType,
          stage: contentItems.stage,
          currentVersionNumber: contentItems.currentVersionNumber,
          scheduledPublicationDate: contentItems.scheduledPublicationDate,
          submissionDeadline: contentItems.submissionDeadline,
          scopeClassification: contentItems.scopeClassification,
          clientVisible: contentItems.clientVisible,
          createdAt: contentItems.createdAt,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.projectId, resolvedProjId),
            isNull(contentItems.deletedAt)
          )
        )
        .orderBy(desc(contentItems.createdAt)),

      db
        .select({
          userId: projectMemberships.userId,
          membershipRole: projectMemberships.membershipRole,
          fullName: users.fullName,
          organizationRole: users.organizationRole,
        })
        .from(projectMemberships)
        .leftJoin(users, eq(projectMemberships.userId, users.id))
        .where(
          and(
            eq(projectMemberships.projectId, resolvedProjId),
            eq(projectMemberships.status, "active")
          )
        ),

      db
        .select({
          id: approvalDecisions.id,
          contentItemId: approvalDecisions.contentItemId,
          submissionVersionId: approvalDecisions.submissionVersionId,
          component: approvalDecisions.component,
          decision: approvalDecisions.decision,
          reviewerRole: approvalDecisions.reviewerRole,
        })
        .from(approvalDecisions)
        .where(
          and(
            eq(approvalDecisions.projectId, resolvedProjId),
            isNull(approvalDecisions.revokedAt)
          )
        ),

      db
        .select({
          contentItemId: founderOverrides.contentItemId,
          submissionVersionId: founderOverrides.submissionVersionId,
          component: founderOverrides.component,
        })
        .from(founderOverrides)
        .where(eq(founderOverrides.projectId, resolvedProjId)),
    ]);

    profiler.mark("parallel-candidates");

    // Client visibility filter
    const visibleCandidates = isClient
      ? candidateItems.filter((i) => i.clientVisible)
      : candidateItems;

    if (visibleCandidates.length === 0) {
      return {
        success: true,
        data: {
          project: {
            id: project.id,
            name: project.name,
            clientBrand: project.clientBrand || project.name,
          },
          counts: { all: 0, pending: 0, changes_requested: 0, approved: 0 },
          items: [],
          projectMembers: memberRows.map((m) => ({
            userId: m.userId,
            name: m.fullName || m.userId,
            role: m.membershipRole || m.organizationRole || "designer",
          })),
        },
      };
    }

    const candidateIds = visibleCandidates.map((i) => i.id);

    // 3. Query submission versions for candidate items to enforce immutable submitted version invariant
    const versions = await db
      .select({
        id: submissionVersions.id,
        contentItemId: submissionVersions.contentItemId,
        versionNumber: submissionVersions.versionNumber,
        isDraft: submissionVersions.isDraft,
        submittedAt: submissionVersions.submittedAt,
      })
      .from(submissionVersions)
      .where(inArray(submissionVersions.contentItemId, candidateIds));

    profiler.mark("query-versions");

    // Index decisions and overrides
    const decisionsByItem = new Map<string, typeof decisionRows>();
    for (const d of decisionRows) {
      const list = decisionsByItem.get(d.contentItemId) || [];
      list.push(d);
      decisionsByItem.set(d.contentItemId, list);
    }

    const overridesByItem = new Map<string, typeof overrideRows>();
    for (const o of overrideRows) {
      const list = overridesByItem.get(o.contentItemId) || [];
      list.push(o);
      overridesByItem.set(o.contentItemId, list);
    }

    const versionsByItem = new Map<string, typeof versions>();
    for (const v of versions) {
      const list = versionsByItem.get(v.contentItemId) || [];
      list.push(v);
      versionsByItem.set(v.contentItemId, list);
    }

    const counts = { all: 0, pending: 0, changes_requested: 0, approved: 0 };
    const allEligibleItems: Array<ApprovalQueueItemDTO & { tab: "pending" | "changes_requested" | "approved" }> = [];

    for (const item of visibleCandidates) {
      // Internal work-in-progress drafts and ideas are NOT reviewable
      if (item.stage === "draft" || item.stage === "idea") {
        continue;
      }

      const itemVers = versionsByItem.get(item.id) || [];
      // CANONICAL INVARIANT: Must have at least one immutable submitted version
      const submittedVers = itemVers.filter((v) => !v.isDraft && v.submittedAt !== null);
      if (submittedVers.length === 0) {
        // No immutable submitted version exists — this deliverable is not reviewable!
        continue;
      }

      // Sort to get latest submitted version
      submittedVers.sort((a, b) => a.versionNumber - b.versionNumber);
      const latestSubmittedVer = submittedVers[submittedVers.length - 1];
      const activeDraftVer = itemVers.find((v) => v.isDraft);

      const itemDecs = decisionsByItem.get(item.id) || [];
      const itemOverrides = overridesByItem.get(item.id) || [];

      // Check 3 components for latest submitted version
      const verDecs = itemDecs.filter((d) => d.submissionVersionId === latestSubmittedVer.id);

      const checkComponent = (comp: "copy" | "creative" | "posting_date") => {
        const compDecs = verDecs.filter((d) => d.component === comp);
        const hasChanges = compDecs.some(
          (d) => d.decision === "changes_requested" || d.decision === "rejected"
        );
        const founderApproved = compDecs.some(
          (d) =>
            (d.reviewerRole === "founder" || d.reviewerRole === "admin") &&
            (d.decision === "approved" || d.decision === "approved_with_conditions")
        );
        const consultantApproved = compDecs.some(
          (d) =>
            d.reviewerRole === "consultant" &&
            (d.decision === "approved" || d.decision === "approved_with_conditions")
        );
        const hasOverride = itemOverrides.some(
          (o) => o.submissionVersionId === latestSubmittedVer.id && (o.component === comp || !o.component)
        );

        const isFullyApproved = (founderApproved && consultantApproved) || hasOverride;
        return {
          isFullyApproved,
          hasChangesRequested: hasChanges && !isFullyApproved,
        };
      };

      const copyStatus = checkComponent("copy");
      const creativeStatus = checkComponent("creative");
      const postingDateStatus = checkComponent("posting_date");

      const allApproved =
        item.stage === "approved" ||
        item.stage === "scheduled" ||
        item.stage === "published" ||
        (copyStatus.isFullyApproved && creativeStatus.isFullyApproved && postingDateStatus.isFullyApproved);

      const anyChanges =
        item.stage === "changes_requested" ||
        copyStatus.hasChangesRequested ||
        creativeStatus.hasChangesRequested ||
        postingDateStatus.hasChangesRequested;

      let tab: "pending" | "changes_requested" | "approved";
      if (allApproved) {
        tab = "approved";
        counts.approved++;
      } else if (anyChanges) {
        tab = "changes_requested";
        counts.changes_requested++;
      } else {
        tab = "pending";
        counts.pending++;
      }
      counts.all++;

      allEligibleItems.push({
        id: item.id,
        projectId: item.projectId,
        title: item.title,
        platform: (item.platform || "Instagram") as ContentPlatform,
        contentType: (item.contentType || "post") as ContentType,
        stage: item.stage as ContentStage,
        currentVersionNumber: item.currentVersionNumber,
        scheduledPublicationDate: item.scheduledPublicationDate ? item.scheduledPublicationDate.toISOString() : null,
        submissionDeadline: item.submissionDeadline ? item.submissionDeadline.toISOString() : null,
        scopeClassification: (item.scopeClassification || "contracted") as ScopeClassification,
        summary: {
          allComponentsApproved: allApproved,
          anyChangesRequested: anyChanges,
          copy: copyStatus,
          creative: creativeStatus,
          posting_date: postingDateStatus,
        },
        latestSubmittedVersionId: latestSubmittedVer.id,
        activeDraftVersionId: activeDraftVer?.id,
        tab,
      });
    }

    // Filter items based on selected tab
    const items =
      filter === "all"
        ? allEligibleItems
        : allEligibleItems.filter((i) => i.tab === filter);

    profiler.mark("dto-assembly");
    profiler.logSummary();

    return {
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          clientBrand: project.clientBrand || project.name,
        },
        counts,
        items,
        projectMembers: memberRows.map((m) => ({
          userId: m.userId,
          name: m.fullName || m.userId,
          role: m.membershipRole || m.organizationRole || "designer",
        })),
      },
    };
  } catch (err: any) {
    console.error("[getAuthoritativeProjectApprovalQueueAction] Error:", err);
    return { success: false, error: err.message || "Failed to load approval queue" };
  }
}

