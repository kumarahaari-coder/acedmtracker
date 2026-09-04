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

export interface GlobalApprovalQueueItemDTO extends ApprovalQueueItemDTO {
  projectName: string;
  clientBrand: string;
  assignedOwner?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null;
}

export interface GlobalApprovalQueueDTO {
  counts: {
    all: number;
    pending: number;
    changes_requested: number;
    approved: number;
  };
  items: GlobalApprovalQueueItemDTO[];
  projects: Array<{ id: string; name: string }>;
}

/**
 * Canonical Evaluator: Enforces identical eligibility and approval state
 * across Project Scope and Global Scope.
 */
function evaluateCanonicalDeliverableApproval(params: {
  item: {
    id: string;
    projectId: string;
    stage: string;
    title: string;
  };
  itemVersions: Array<{
    id: string;
    versionNumber: number;
    isDraft: boolean;
    submittedAt: Date | null;
  }>;
  itemDecisions: Array<{
    id: string;
    submissionVersionId: string;
    component: string;
    decision: string;
    reviewerRole: string;
  }>;
  itemOverrides: Array<{
    id: string;
    submissionVersionId?: string | null;
    component?: string | null;
  }>;
}): {
  latestSubmittedVer: { id: string; versionNumber: number; submittedAt: Date | null };
  activeDraftVer?: { id: string };
  summary: {
    allComponentsApproved: boolean;
    anyChangesRequested: boolean;
    copy: { isFullyApproved: boolean; hasChangesRequested: boolean };
    creative: { isFullyApproved: boolean; hasChangesRequested: boolean };
    posting_date: { isFullyApproved: boolean; hasChangesRequested: boolean };
  };
  tab: "pending" | "changes_requested" | "approved";
} | null {
  const { item, itemVersions, itemDecisions, itemOverrides } = params;

  // 1. Internal work-in-progress drafts and ideas are NOT reviewable
  if (item.stage === "draft" || item.stage === "idea") {
    return null;
  }

  // 2. CANONICAL INVARIANT: Must have at least one immutable submitted version
  const submittedVers = itemVersions.filter((v) => !v.isDraft && v.submittedAt !== null);
  if (submittedVers.length === 0) {
    return null;
  }

  // Sort to get latest submitted version
  submittedVers.sort((a, b) => a.versionNumber - b.versionNumber);
  const latestSubmittedVer = submittedVers[submittedVers.length - 1];
  const activeDraftVer = itemVersions.find((v) => v.isDraft);

  // Check 3 components for latest submitted version
  const verDecs = itemDecisions.filter((d) => d.submissionVersionId === latestSubmittedVer.id);

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
      (o) =>
        (!o.submissionVersionId || o.submissionVersionId === latestSubmittedVer.id) &&
        (o.component === comp || !o.component || o.component === "all" || o.component === "full")
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
  } else if (anyChanges) {
    tab = "changes_requested";
  } else {
    tab = "pending";
  }

  return {
    latestSubmittedVer,
    activeDraftVer,
    summary: {
      allComponentsApproved: allApproved,
      anyChangesRequested: anyChanges,
      copy: copyStatus,
      creative: creativeStatus,
      posting_date: postingDateStatus,
    },
    tab,
  };
}

/**
 * Authoritative Global Approval Queue Query.
 * Replaces legacy getAuthoritativeOrganizationApprovalsAction.
 * Scoped authoritatively to only projects the actor is authorized to review.
 * Uses the exact same canonical review eligibility rules as the project scope.
 */
export async function getAuthoritativeGlobalApprovalQueueAction(
  filter: "all" | "pending" | "changes_requested" | "approved" = "pending",
  actorUserId?: string
): Promise<{
  success: boolean;
  data?: GlobalApprovalQueueDTO;
  error?: string;
}> {
  try {
    const profiler = new ExecutionProfiler("getAuthoritativeGlobalApprovalQueueAction");
    const actor = await getAuthoritativeUser(actorUserId);
    if (!actor || actor.status !== "active") {
      return { success: false, error: "Unauthorized: Active user session required" };
    }

    profiler.mark("auth-resolution");

    // 1. Role-based scoping of projects
    let authorizedProjectIds: string[] = [];
    const isFounderOrAdmin = actor.organizationRole === "founder" || actor.organizationRole === "admin";

    if (isFounderOrAdmin) {
      // Authorized for all active, non-deleted projects in org
      const orgProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.orgId, actor.orgId),
            isNull(projects.deletedAt),
            isNull(projects.archivedAt)
          )
        );
      authorizedProjectIds = orgProjects.map((p) => p.id);
    } else {
      // Consultant / Designer / Client: active project memberships only
      const userMemberships = await db
        .select({ projectId: projectMemberships.projectId })
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.userId, actor.id),
            eq(projectMemberships.orgId, actor.orgId),
            eq(projectMemberships.status, "active")
          )
        );
      authorizedProjectIds = userMemberships.map((m) => m.projectId);
    }

    if (authorizedProjectIds.length === 0) {
      return {
        success: true,
        data: {
          counts: { all: 0, pending: 0, changes_requested: 0, approved: 0 },
          items: [],
          projects: [],
        },
      };
    }

    // 2. Fetch authorized project metadata
    const authorizedProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
      })
      .from(projects)
      .where(inArray(projects.id, authorizedProjectIds));

    const projectMap = new Map(authorizedProjects.map((p) => [p.id, p]));

    // 3. Fetch candidate reviewable content items across authorized projects
    // Note: Items must be NOT deleted and NOT draft/idea
    const candidateItems = await db
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
      })
      .from(contentItems)
      .where(
        and(
          inArray(contentItems.projectId, authorizedProjectIds),
          isNull(contentItems.deletedAt),
          sql`${contentItems.stage} NOT IN ('draft', 'idea')`
        )
      );

    if (candidateItems.length === 0) {
      return {
        success: true,
        data: {
          counts: { all: 0, pending: 0, changes_requested: 0, approved: 0 },
          items: [],
          projects: authorizedProjects.map((p) => ({ id: p.id, name: p.name })),
        },
      };
    }

    const candidateIds = candidateItems.map((c) => c.id);

    // 4. Parallel set-based queries for candidate relations
    const [versionRows, decisionRows, overrideRows, assignmentRows] = await Promise.all([
      db
        .select({
          id: submissionVersions.id,
          contentItemId: submissionVersions.contentItemId,
          versionNumber: submissionVersions.versionNumber,
          isDraft: submissionVersions.isDraft,
          submittedAt: submissionVersions.submittedAt,
        })
        .from(submissionVersions)
        .where(inArray(submissionVersions.contentItemId, candidateIds)),

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
            inArray(approvalDecisions.contentItemId, candidateIds),
            isNull(approvalDecisions.revokedAt)
          )
        ),

      db
        .select({
          id: founderOverrides.id,
          contentItemId: founderOverrides.contentItemId,
          submissionVersionId: founderOverrides.submissionVersionId,
          component: founderOverrides.component,
        })
        .from(founderOverrides)
        .where(inArray(founderOverrides.contentItemId, candidateIds)),

      db
        .select({
          id: contentAssignments.id,
          contentItemId: contentAssignments.contentItemId,
          assigneeUserId: contentAssignments.assigneeUserId,
          status: contentAssignments.status,
          userFullName: users.fullName,
          userAvatarUrl: users.avatarUrl,
        })
        .from(contentAssignments)
        .innerJoin(users, eq(users.id, contentAssignments.assigneeUserId))
        .where(
          and(
            inArray(contentAssignments.contentItemId, candidateIds),
            inArray(contentAssignments.status, ["assigned", "accepted", "in_progress"])
          )
        ),
    ]);

    profiler.mark("query-relations");

    // Index relations by contentItemId
    const versionsByItem = new Map<string, typeof versionRows>();
    for (const v of versionRows) {
      const list = versionsByItem.get(v.contentItemId) || [];
      list.push(v);
      versionsByItem.set(v.contentItemId, list);
    }

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

    const assignmentsByItem = new Map<string, (typeof assignmentRows)[0]>();
    for (const a of assignmentRows) {
      if (!assignmentsByItem.has(a.contentItemId)) {
        assignmentsByItem.set(a.contentItemId, a);
      }
    }

    // 5. Evaluate canonical eligibility and approval state for each candidate
    const counts = { all: 0, pending: 0, changes_requested: 0, approved: 0 };
    const allEligibleItems: Array<GlobalApprovalQueueItemDTO & { tab: "pending" | "changes_requested" | "approved" }> = [];

    for (const item of candidateItems) {
      const itemVers = versionsByItem.get(item.id) || [];
      const itemDecs = decisionsByItem.get(item.id) || [];
      const itemOverrides = overridesByItem.get(item.id) || [];

      const evalResult = evaluateCanonicalDeliverableApproval({
        item,
        itemVersions: itemVers,
        itemDecisions: itemDecs,
        itemOverrides,
      });

      if (!evalResult) {
        continue;
      }

      const proj = projectMap.get(item.projectId);
      const asgn = assignmentsByItem.get(item.id);

      counts[evalResult.tab]++;
      counts.all++;

      allEligibleItems.push({
        id: item.id,
        projectId: item.projectId,
        projectName: proj?.name || "Unknown Project",
        clientBrand: proj?.clientName || proj?.name || "",
        title: item.title,
        platform: (item.platform || "Instagram") as ContentPlatform,
        contentType: (item.contentType || "post") as ContentType,
        stage: item.stage as ContentStage,
        currentVersionNumber: item.currentVersionNumber,
        scheduledPublicationDate: item.scheduledPublicationDate ? item.scheduledPublicationDate.toISOString() : null,
        submissionDeadline: item.submissionDeadline ? item.submissionDeadline.toISOString() : null,
        scopeClassification: (item.scopeClassification || "contracted") as ScopeClassification,
        summary: evalResult.summary,
        latestSubmittedVersionId: evalResult.latestSubmittedVer.id,
        activeDraftVersionId: evalResult.activeDraftVer?.id,
        assignedOwner: asgn
          ? {
              id: asgn.assigneeUserId,
              name: asgn.userFullName || asgn.assigneeUserId,
              avatarUrl: asgn.userAvatarUrl,
            }
          : null,
        tab: evalResult.tab,
      });
    }

    const items =
      filter === "all"
        ? allEligibleItems
        : allEligibleItems.filter((i) => i.tab === filter);

    profiler.mark("dto-assembly");
    profiler.logSummary();

    return {
      success: true,
      data: {
        counts,
        items,
        projects: authorizedProjects.map((p) => ({ id: p.id, name: p.name })),
      },
    };
  } catch (err: any) {
    console.error("[getAuthoritativeGlobalApprovalQueueAction] Error:", err);
    return { success: false, error: err.message || "Failed to load global approval queue" };
  }
}

/**
 * Legacy wrapper for backwards compatibility with any remaining references.
 */
export async function getAuthoritativeOrganizationApprovalsAction(actorUserId?: string): Promise<{
  success: boolean;
  items: OrganizationApprovalItem[];
  projects: Array<{ id: string; name: string }>;
  teamMembers: Array<{ id: string; name: string }>;
  error?: string;
}> {
  const res = await getAuthoritativeGlobalApprovalQueueAction("all", actorUserId);
  if (!res.success || !res.data) {
    return { success: false, items: [], projects: [], teamMembers: [], error: res.error };
  }

  const mapped: OrganizationApprovalItem[] = res.data.items.map((i) => ({
    id: i.id,
    projectId: i.projectId,
    projectName: i.projectName,
    clientBrand: i.clientBrand,
    title: i.title,
    platform: i.platform,
    contentType: i.contentType,
    stage: i.stage,
    currentVersionNumber: i.currentVersionNumber,
    assignedOwnerId: i.assignedOwner?.id,
    assignedOwnerName: i.assignedOwner?.name,
    assignedOwnerAvatar: i.assignedOwner?.avatarUrl || undefined,
    submissionDeadline: i.submissionDeadline || undefined,
    copyApprovalStatus: i.summary.copy.hasChangesRequested ? "changes_requested" : i.summary.copy.isFullyApproved ? "approved" : "pending",
    creativeApprovalStatus: i.summary.creative.hasChangesRequested ? "changes_requested" : i.summary.creative.isFullyApproved ? "approved" : "pending",
    postingDateApprovalStatus: i.summary.posting_date.hasChangesRequested ? "changes_requested" : i.summary.posting_date.isFullyApproved ? "approved" : "pending",
    consultantStatus: i.summary.allComponentsApproved ? "approved" : i.summary.anyChangesRequested ? "changes_requested" : "pending",
    founderStatus: i.summary.allComponentsApproved ? "approved" : i.summary.anyChangesRequested ? "changes_requested" : "pending",
    overallStatus: i.summary.allComponentsApproved ? "approved" : i.summary.anyChangesRequested ? "changes_requested" : "in_review",
  }));

  return {
    success: true,
    items: mapped,
    projects: res.data.projects,
    teamMembers: [],
  };
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

    if (params.decision === "changes_requested") {
      await db
        .update(contentItems)
        .set({ stage: "changes_requested", updatedAt: new Date() })
        .where(eq(contentItems.id, version.contentItemId));
    } else if (params.decision === "approved") {
      // Check if all 3 components are now fully approved (Founder + Consultant or Founder Override)
      const [allDecs, overrides] = await Promise.all([
        db
          .select({
            component: approvalDecisions.component,
            decision: approvalDecisions.decision,
            reviewerRole: approvalDecisions.reviewerRole,
          })
          .from(approvalDecisions)
          .where(
            and(
              eq(approvalDecisions.submissionVersionId, version.id),
              isNull(approvalDecisions.revokedAt)
            )
          ),
        db
          .select({
            component: founderOverrides.component,
            submissionVersionId: founderOverrides.submissionVersionId,
          })
          .from(founderOverrides)
          .where(eq(founderOverrides.contentItemId, version.contentItemId)),
      ]);

      const checkComp = (comp: string) => {
        const compDecs = allDecs.filter((d) => d.component === comp);
        const fApp = compDecs.some(
          (d) =>
            (d.reviewerRole === "founder" || d.reviewerRole === "admin") &&
            (d.decision === "approved" || d.decision === "approved_with_conditions")
        );
        const cApp = compDecs.some(
          (d) =>
            d.reviewerRole === "consultant" &&
            (d.decision === "approved" || d.decision === "approved_with_conditions")
        );
        const ov = overrides.some(
          (o) =>
            (!o.submissionVersionId || o.submissionVersionId === version.id) &&
            (o.component === comp || !o.component || o.component === "all" || o.component === "full")
        );
        return (fApp && cApp) || ov;
      };

      if (checkComp("copy") && checkComp("creative") && checkComp("posting_date")) {
        await db
          .update(contentItems)
          .set({ stage: "approved", updatedAt: new Date() })
          .where(eq(contentItems.id, version.contentItemId));
      }
    }

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

    const [project] = await db
      .select({ orgId: projects.orgId })
      .from(projects)
      .where(eq(projects.id, item.projectId))
      .limit(1);
    const resolvedOrgId = project?.orgId || item.orgId;

    let versionId = params.submissionVersionId;
    if (!versionId) {
      const [latestVersion] = await db
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.contentItemId, item.id))
        .orderBy(desc(submissionVersions.versionNumber))
        .limit(1);
      versionId = latestVersion?.id;
    }

    if (!versionId) {
      const [newVersion] = await db
        .insert(submissionVersions)
        .values({
          projectId: item.projectId,
          orgId: resolvedOrgId,
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
        orgId: resolvedOrgId,
        contentItemId: item.id,
        submissionVersionId: versionId,
        component: params.overrideType && params.overrideType !== "all" && params.overrideType !== "full" ? params.overrideType : null,
        reason: params.justification || params.reason || "Founder override executed",
        actorUserId: actor.id,
      })
      .returning();

    // If overriding entire deliverable or full approval, advance item stage to 'approved'
    if (!params.overrideType || params.overrideType === "all" || params.overrideType === "full") {
      await db
        .update(contentItems)
        .set({ stage: "approved", updatedAt: new Date() })
        .where(eq(contentItems.id, item.id));
    }

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
          id: founderOverrides.id,
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
      const itemVers = versionsByItem.get(item.id) || [];
      const itemDecs = decisionsByItem.get(item.id) || [];
      const itemOverrides = overridesByItem.get(item.id) || [];

      const evalResult = evaluateCanonicalDeliverableApproval({
        item,
        itemVersions: itemVers,
        itemDecisions: itemDecs,
        itemOverrides,
      });

      if (!evalResult) {
        continue;
      }

      counts[evalResult.tab]++;
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
        summary: evalResult.summary,
        latestSubmittedVersionId: evalResult.latestSubmittedVer.id,
        activeDraftVersionId: evalResult.activeDraftVer?.id,
        tab: evalResult.tab,
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

