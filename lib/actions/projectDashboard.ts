"use server";

import { db } from "../db";
import { projects, projectMemberships, users, contentItems, contentAssignments, workSessions } from "../db/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { resolveProjectId } from "../compat/resolver";
import { ExecutionProfiler } from "../observability/profiler";
import { getEffectiveOperationalDeadline, getISTDateBoundaries, isAssignmentStatusActive, ACTIVE_ASSIGNMENT_STATUSES } from "../calculations/operationalDeadline";

export interface ProjectAssignedWorkItemDTO {
  id: string;
  projectId: string;
  title: string;
  platform: string;
  contentType: string;
  workType?: string;
  scopeClassification: string;
  stage: string;
  figmaUrl?: string;
  clientDeliveryDate?: string;
  primaryOwnerId?: string;
  primaryOwnerName?: string;
  primaryOwnerAvatar?: string;
  assignmentId?: string;
  assignmentStatus?: string; // 'assigned' | 'accepted' | 'in_progress'
  operationalDeadline: string; // ISO string of canonical COALESCE(final_internal_deadline, calculated_internal_deadline, submission_deadline)
  publicationDate?: string;
  totalTrackedSeconds: number;
  plannedEffortSeconds?: number;
  isAssignedToCurrentUser: boolean;
}

export interface ProjectDashboardDTO {
  project: {
    id: string;
    name: string;
    clientBrand: string;
    projectType: string;
    masterFigmaUrl?: string | null;
    status: string;
    timezone: string;
    scope?: string | null;
    engagementModel?: string;
    objectiveConfig?: any;
    targetRequirements?: any;
  };
  metrics: {
    totalPipeline: number;
    publishedCount: number;
    inReviewCount: number;
    scheduledCount: number;
    overdueCount: number;
    contractedCount: number;
    goodwillCount: number;
    additionalBillableCount: number;
    completedContractedCount: number;
    completedGoodwillCount: number;
    completedAdditionalCount: number;
    deliverableCompletionPercentage: number;
    objectivePercentage: number;
  };
  members: Array<{
    userId: string;
    name: string;
    role: string;
    avatar?: string;
  }>;
  assignedWork: ProjectAssignedWorkItemDTO[];
  userRole: string;
  isManagement: boolean;
}

/**
 * Authoritative Server Action for Project Dashboard & Assigned Work.
 * Enforces PostgreSQL source of truth, authoritative role scoping,
 * and canonical operational deadline resolution.
 */
export async function getAuthoritativeProjectDashboardAction(
  projectId: string,
  actorUserId?: string
): Promise<{
  success: boolean;
  data?: ProjectDashboardDTO;
  error?: string;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeProjectDashboardAction");
  try {
    const resolvedUserId = (process.env.NODE_ENV === "test" || process.env.VITEST) ? actorUserId : undefined;
    const authUser = await getAuthoritativeUser(resolvedUserId || actorUserId);
    if (!authUser) return { success: false, error: "Unauthorized" };
    profiler.mark("auth-resolution");

    const canonicalProjectId = await resolveProjectId(projectId);
    if (!canonicalProjectId) return { success: false, error: "Project not found" };

    const access = await requireProjectAccess(authUser.id, canonicalProjectId);
    if (!access.allowed) {
      return { success: false, error: access.reason || "403 Forbidden: Project access denied" };
    }

    const orgId = authUser.orgId;
    const isManagement =
      authUser.organizationRole === "founder" ||
      authUser.organizationRole === "admin" ||
      (authUser.organizationRole === "consultant" && access.role === "consultant");
    const isDesigner = authUser.organizationRole === "designer";
    const isClient = authUser.organizationRole === "client";

    if (isClient) {
      return { success: false, error: "403 Forbidden: Clients cannot view internal operational dashboard" };
    }

    const { startOfToday } = getISTDateBoundaries(new Date());

    // Multiplexed parallel database fetch
    const [projectRows, memberRows, itemRows, sessionRows] = await Promise.all([
      // 1. Project details
      db
        .select()
        .from(projects)
        .where(and(eq(projects.id, canonicalProjectId), eq(projects.orgId, orgId)))
        .limit(1),

      // 2. Active project members
      db.execute(sql`
        SELECT 
          pm.user_id as "userId",
          u.full_name as "name",
          pm.membership_role as "role",
          u.avatar_url as "avatar"
        FROM project_memberships pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ${canonicalProjectId}
          AND pm.status = 'active'
          AND u.status = 'active'
        ORDER BY u.full_name ASC
      `),

      // 3. All non-deleted, non-archived deliverables + active assignments (assigned, accepted, in_progress)
      db.execute(sql`
        SELECT 
          ci.id,
          ci.project_id as "projectId",
          ci.title,
          ci.platform,
          ci.content_type as "contentType",
          ci.work_type as "workType",
          ci.scope_classification as "scopeClassification",
          ci.stage,
          ci.status,
          ci.figma_url as "figmaUrl",
          ci.client_delivery_date as "clientDeliveryDate",
          ci.scheduled_publication_date as "publicationDate",
          ci.final_internal_deadline as "finalInternalDeadline",
          ci.calculated_internal_deadline as "calculatedInternalDeadline",
          ci.submission_deadline as "submissionDeadline",
          ci.final_planned_seconds as "finalPlannedSeconds",
          ci.standard_content_seconds as "standardContentSeconds",
          ci.completed_at as "completedAt",
          ci.created_at as "createdAt",
          ca.id as "assignmentId",
          ca.assignee_user_id as "assigneeUserId",
          u.full_name as "assigneeName",
          u.avatar_url as "assigneeAvatar",
          ca.status as "assignmentStatus",
          ca.current_due_at as "assignmentCurrentDueAt"
        FROM content_items ci
        LEFT JOIN content_assignments ca 
          ON ca.content_item_id = ci.id 
         AND ca.status IN ('assigned', 'accepted', 'in_progress')
        LEFT JOIN users u ON u.id = ca.assignee_user_id
        WHERE ci.project_id = ${canonicalProjectId}
          AND ci.deleted_at IS NULL
          AND ci.status != 'archived'
        ORDER BY ci.created_at DESC
      `),

      // 4. Tracked effort sum per item from work sessions
      db.execute(sql`
        SELECT 
          ws.content_item_id as "contentItemId",
          COALESCE(SUM(ws.accumulated_seconds), 0)::int as "trackedSeconds"
        FROM work_sessions ws
        WHERE ws.project_id = ${canonicalProjectId}
        GROUP BY ws.content_item_id
      `),
    ]);

    const projectRecord = projectRows[0];
    if (!projectRecord) return { success: false, error: "Project not found" };

    profiler.mark("db-queries");

    // Map tracked seconds
    const trackedSecondsMap = new Map<string, number>();
    for (const row of sessionRows.rows as any[]) {
      if (row.contentItemId) {
        trackedSecondsMap.set(row.contentItemId, Number(row.trackedSeconds || 0));
      }
    }

    const items = itemRows.rows as any[];

    // Metrics computation
    let publishedCount = 0;
    let inReviewCount = 0;
    let scheduledCount = 0;
    let overdueCount = 0;
    let contractedCount = 0;
    let goodwillCount = 0;
    let additionalBillableCount = 0;
    let completedContractedCount = 0;
    let completedGoodwillCount = 0;
    let completedAdditionalCount = 0;

    const allAssignedItems: ProjectAssignedWorkItemDTO[] = [];

    for (const row of items) {
      const isPublished = row.stage === "published";
      const isApproved = row.stage === "approved";
      const isCompleted = isPublished || isApproved || row.completedAt != null;

      if (isPublished) publishedCount++;
      if (row.stage === "in_review" || row.stage === "submitted") inReviewCount++;
      if (row.stage === "scheduled") scheduledCount++;

      const scope = row.scopeClassification || "contracted";
      if (scope === "goodwill") {
        goodwillCount++;
        if (isCompleted) completedGoodwillCount++;
      } else if (scope === "additional_billable") {
        additionalBillableCount++;
        if (isCompleted) completedAdditionalCount++;
      } else {
        contractedCount++;
        if (isCompleted) completedContractedCount++;
      }

      // Canonical operational deadline calculation
      const opDeadline = getEffectiveOperationalDeadline({
        finalInternalDeadline: row.finalInternalDeadline,
        calculatedInternalDeadline: row.calculatedInternalDeadline,
        submissionDeadline: row.submissionDeadline,
      });

      if (!isCompleted && opDeadline && opDeadline < startOfToday) {
        overdueCount++;
      }

      // Invariant 5: Include all active deliverables that have an active assignment
      // (assigned, accepted, in_progress) regardless of deadline dates.
      const hasActiveAssignment = isAssignmentStatusActive(row.assignmentStatus);
      const isAssignedToCurrent = row.assigneeUserId === authUser.id;

      // Invariant 6: Role scoping
      // If user is a designer: only include their own assignments!
      // If management: include all active assigned items.
      if (hasActiveAssignment) {
        if (!isDesigner || isAssignedToCurrent) {
          allAssignedItems.push({
            id: row.id,
            projectId: row.projectId,
            title: row.title,
            platform: row.platform || "Instagram",
            contentType: row.contentType || "post",
            workType: row.workType || undefined,
            scopeClassification: scope,
            stage: row.stage || "draft",
            figmaUrl: row.figmaUrl || undefined,
            clientDeliveryDate: row.clientDeliveryDate ? new Date(row.clientDeliveryDate).toISOString() : undefined,
            primaryOwnerId: row.assigneeUserId || undefined,
            primaryOwnerName: row.assigneeName || "Unassigned",
            primaryOwnerAvatar: row.assigneeAvatar || undefined,
            assignmentId: row.assignmentId || undefined,
            assignmentStatus: row.assignmentStatus || undefined,
            operationalDeadline: opDeadline ? opDeadline.toISOString() : (row.publicationDate ? new Date(row.publicationDate).toISOString() : "Unset"),
            publicationDate: row.publicationDate ? new Date(row.publicationDate).toISOString() : undefined,
            totalTrackedSeconds: trackedSecondsMap.get(row.id) || 0,
            plannedEffortSeconds: Number(row.finalPlannedSeconds || row.standardContentSeconds || 0),
            isAssignedToCurrentUser: isAssignedToCurrent,
          });
        }
      }
    }

    // Engagement target metrics
    const targetReq = (projectRecord as any).targetRequirements || { posts: 0, carousels: 0, reels: 0, trialReels: 0 };
    const totalContractedTarget = (targetReq.posts || 0) + (targetReq.carousels || 0) + (targetReq.reels || 0) + (targetReq.trialReels || 0);
    const deliverableCompletionPercentage =
      totalContractedTarget > 0
        ? Math.min(100, Math.round((completedContractedCount / totalContractedTarget) * 100))
        : 0;

    const objective = (projectRecord as any).objectiveConfig;
    const objectivePercentage =
      objective && objective.targetValue > 0
        ? Math.min(100, Math.round((Number(objective.currentValue || 0) / Number(objective.targetValue)) * 100))
        : 0;

    const members = (memberRows.rows as any[]).map((m) => ({
      userId: m.userId,
      name: m.name,
      role: m.role || "designer",
      avatar: m.avatar || undefined,
    }));

    profiler.mark("dto-assembly");
    profiler.logSummary();

    return {
      success: true,
      data: {
        project: {
          id: projectRecord.id,
          name: projectRecord.name,
          clientBrand: projectRecord.clientName,
          projectType: projectRecord.projectType || "digital_marketing",
          masterFigmaUrl: projectRecord.masterFigmaUrl,
          status: projectRecord.status,
          timezone: "Asia/Kolkata",
          scope: projectRecord.tier,
          engagementModel: projectRecord.engagementModel || "deliverable_based",
          objectiveConfig: (projectRecord as any).objectiveConfig,
          targetRequirements: (projectRecord as any).targetRequirements,
        },
        metrics: {
          totalPipeline: items.length,
          publishedCount,
          inReviewCount,
          scheduledCount,
          overdueCount,
          contractedCount,
          goodwillCount,
          additionalBillableCount,
          completedContractedCount,
          completedGoodwillCount,
          completedAdditionalCount,
          deliverableCompletionPercentage,
          objectivePercentage,
        },
        members,
        assignedWork: allAssignedItems,
        userRole: authUser.organizationRole,
        isManagement,
      },
    };
  } catch (err: any) {
    console.error("[getAuthoritativeProjectDashboardAction] error:", err);
    return { success: false, error: err.message || "Failed to load project dashboard" };
  }
}
