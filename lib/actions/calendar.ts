"use server";

import { db } from "../db";
import { projects, projectMemberships, users, contentItems, contentAssignments, ACTIVE_ASSIGNMENT_STATUSES } from "../db/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { ContentItem, EffortStandard } from "../types";
import { getCachedEffortStandards } from "../cache/effortStandardsCache";
import { ExecutionProfiler } from "../observability/profiler";

export interface CalendarDataDTO {
  project: {
    id: string;
    name: string;
    clientBrand: string;
    status: string;
  } | null;
  items: ContentItem[];
  eligibleProjectMembers: Array<{
    membership: {
      id: string;
      projectId: string;
      userId: string;
      membershipRole: string;
      status: string;
    };
    user: {
      id: string;
      name: string;
      role: string;
      email: string;
      avatar?: string;
    };
  }>;
  effortStandards: EffortStandard[];
}

/**
 * Bounded Calendar Data Action.
 * Fetches strictly:
 * 1. The selected project
 * 2. Deliverables within the requested month window (+/- 7 days padding)
 * 3. Active eligible members on the project
 * 4. Master effort standards (from Worker isolate in-memory cache)
 *
 * Never hydrates work sessions, change requests, audit records, or unrelated project data.
 */
export async function getAuthoritativeCalendarDataAction(
  projectId: string,
  year: number,
  month: number, // 0-indexed month (0 = Jan, 11 = Dec)
  actorUserId?: string
): Promise<{
  success: boolean;
  data?: CalendarDataDTO;
  error?: string;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeCalendarDataAction");
  try {
    const resolvedUserId = (process.env.NODE_ENV === "test" || process.env.VITEST) ? actorUserId : undefined;
    const authUser = await getAuthoritativeUser(resolvedUserId);
    if (!authUser) return { success: false, error: "Unauthorized" };
    profiler.mark("auth-resolution");

    // Enforce project membership / organization authority
    const access = await requireProjectAccess(authUser.id, projectId);
    if (!access.allowed) {
      return { success: false, error: access.reason || "403 Forbidden: Project access denied" };
    }

    const orgId = authUser.orgId;

    // Calculate bounded date range with +/- 7 days buffer for calendar grid padding
    const startDate = new Date(Date.UTC(year, month, 1));
    startDate.setUTCDate(startDate.getUTCDate() - 7);
    const startStr = startDate.toISOString().split("T")[0];

    const endDate = new Date(Date.UTC(year, month + 1, 0));
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const endStr = endDate.toISOString().split("T")[0] + "T23:59:59.999Z";

    // 1. Fetch project, eligible members, effort standards, and items in parallel
    const [
      [projectRow],
      memberRows,
      standards,
      itemRows,
    ] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          clientBrand: projects.clientName,
          status: projects.status,
        })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
        .limit(1),

      db
        .select({
          membershipId: projectMemberships.id,
          projectId: projectMemberships.projectId,
          userId: projectMemberships.userId,
          membershipRole: projectMemberships.membershipRole,
          status: projectMemberships.status,
          userName: users.fullName,
          userRole: users.organizationRole,
          userEmail: users.email,
          userAvatar: users.avatarUrl,
          userStatus: users.status,
        })
        .from(projectMemberships)
        .innerJoin(users, eq(users.id, projectMemberships.userId))
        .where(
          and(
            eq(projectMemberships.projectId, projectId),
            eq(projectMemberships.orgId, orgId),
            eq(projectMemberships.status, "active"),
            eq(users.status, "active")
          )
        ),

      getCachedEffortStandards(orgId),

      db
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.projectId, projectId),
            eq(contentItems.orgId, orgId),
            sql`${contentItems.deletedAt} IS NULL`,
            sql`(
              (${contentItems.scheduledPublicationDate}::text >= ${startStr} AND ${contentItems.scheduledPublicationDate}::text <= ${endStr})
              OR (${contentItems.submissionDeadline}::text >= ${startStr} AND ${contentItems.submissionDeadline}::text <= ${endStr})
              OR (${contentItems.finalInternalDeadline}::text >= ${startStr} AND ${contentItems.finalInternalDeadline}::text <= ${endStr})
              OR (${contentItems.createdAt}::text >= ${startStr} AND ${contentItems.createdAt}::text <= ${endStr})
            )`
          )
        ),
    ]);

    profiler.mark("queries", itemRows.length + memberRows.length);

    if (!projectRow) {
      return { success: false, error: "Project not found or inaccessible" };
    }

    // Format eligible production members
    const eligibleProductionRoles = new Set(["designer", "video_editor", "collaborator", "consultant"]);
    const eligibleProjectMembers = memberRows
      .filter(
        (m) =>
          m.membershipRole &&
          eligibleProductionRoles.has(m.membershipRole) &&
          m.userRole !== "client"
      )
      .map((m) => ({
        membership: {
          id: m.membershipId,
          projectId: m.projectId,
          userId: m.userId,
          membershipRole: m.membershipRole,
          status: m.status,
        },
        user: {
          id: m.userId,
          name: m.userName,
          role: m.userRole,
          email: m.userEmail,
          avatar: m.userAvatar || undefined,
        },
      }));

    // Map bounded content items
    const items: ContentItem[] = itemRows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      contentGroupId: r.contentGroupId || undefined,
      title: r.title,
      platform: r.platform as any,
      contentType: r.contentType as any,
      stage: r.stage as any,
      scopeClassification: (r.scopeClassification as any) || "contracted",
      clientVisible: r.clientVisible,
      workType: r.workType || undefined,
      workTypeId: r.workTypeId || undefined,
      campaignId: r.campaignId || undefined,
      contentPillar: r.contentPillar || undefined,
      topic: r.topic || undefined,
      brief: r.brief || undefined,
      referenceLink: r.referenceLink || undefined,
      priority: (r.priority as any) || "normal",
      workNature: (r.workNature as any) || "planned",
      accountOwnerId: r.accountOwnerId || undefined,
      accountableOwnerId: r.accountOwnerId || "",
      collaboratorIds: [],
      deadlines: {
        submissionDeadline: r.submissionDeadline ? r.submissionDeadline.toISOString() : undefined,
        resubmissionDeadline: r.resubmissionDeadline ? r.resubmissionDeadline.toISOString() : undefined,
        approvalTarget: r.approvalTarget ? r.approvalTarget.toISOString() : undefined,
        scheduledPublicationDate: r.scheduledPublicationDate ? r.scheduledPublicationDate.toISOString() : undefined,
      },
      calculatedInternalDeadline: r.calculatedInternalDeadline ? r.calculatedInternalDeadline.toISOString() : undefined,
      finalInternalDeadline: r.finalInternalDeadline ? r.finalInternalDeadline.toISOString() : undefined,
      deadlineOverrideReason: r.deadlineOverrideReason || undefined,
      standardContentSeconds: r.standardContentSeconds ?? undefined,
      standardProductionSeconds: r.standardProductionSeconds ?? undefined,
      revisionContentSeconds: r.revisionContentSeconds ?? undefined,
      revisionProductionSeconds: r.revisionProductionSeconds ?? undefined,
      finalPlannedSeconds: r.finalPlannedSeconds ?? undefined,
      isEffortAnchor: r.isEffortAnchor ?? undefined,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : undefined,
      liveUrl: r.liveUrl || undefined,
      currentVersionNumber: r.currentVersionNumber,
      completedAt: r.completedAt ? r.completedAt.toISOString() : undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    profiler.mark("dto-mapping");
    profiler.logSummary();

    return {
      success: true,
      data: {
        project: projectRow,
        items,
        eligibleProjectMembers,
        effortStandards: standards,
      },
    };
  } catch (err: any) {
    console.error("[getAuthoritativeCalendarDataAction] error:", err);
    return { success: false, error: err.message || "Failed to load calendar data" };
  }
}

export interface OrganizationCalendarItem {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  workType: string;
  platform: string;
  stage: string;
  approvalStatus: string;
  assignedOwnerId?: string;
  assignedOwnerName?: string;
  deadline?: string;
  scheduledPublicationDate?: string;
  submissionDeadline?: string;
}

/**
 * Organization-wide calendar action.
 * Returns deliverables across projects using set-based SQL with limits.
 */
export async function getAuthoritativeOrganizationCalendarAction(actorUserId?: string): Promise<{
  success: boolean;
  items: OrganizationCalendarItem[];
  projects: Array<{ id: string; name: string }>;
  teamMembers: Array<{ id: string; name: string }>;
  isDesigner?: boolean;
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) {
      return { success: false, items: [], projects: [], teamMembers: [], error: "Unauthorized" };
    }

    const orgId = authUser.orgId;
    const isDesigner = authUser.organizationRole === "designer";

    if (isDesigner) {
      // 1. Designer Scope: ONLY active deliverables assigned to this designer in projects where they are active members
      const [itemRowsRes, projectRows] = await Promise.all([
        db.execute(sql`
          SELECT 
            ci.id,
            ci.project_id as "projectId",
            p.name as "projectName",
            ci.title,
            COALESCE(ci.work_type, ci.content_type) as "workType",
            ci.platform,
            ci.stage,
            CASE 
              WHEN ci.stage = 'approved' THEN 'Approved'
              WHEN ci.stage = 'in_review' THEN 'Under Review'
              WHEN ci.stage = 'changes_requested' THEN 'Changes Requested'
              ELSE 'Draft'
            END as "approvalStatus",
            ca.assignee_user_id as "assignedOwnerId",
            u.full_name as "assignedOwnerName",
            COALESCE(ci.final_internal_deadline::text, ci.calculated_internal_deadline::text, ci.submission_deadline::text, ci.scheduled_publication_date::text) as "deadline",
            ci.scheduled_publication_date::text as "scheduledPublicationDate",
            ci.submission_deadline::text as "submissionDeadline"
          FROM content_items ci
          JOIN projects p ON ci.project_id = p.id
          JOIN project_memberships pm ON pm.project_id = p.id 
            AND pm.user_id = ${authUser.id} 
            AND pm.status = 'active'
            AND pm.org_id = ${orgId}
          JOIN content_assignments ca ON ca.content_item_id = ci.id 
            AND ca.assignee_user_id = ${authUser.id}
            AND ca.status IN ('assigned', 'accepted', 'in_progress')
          LEFT JOIN users u ON u.id = ca.assignee_user_id
          WHERE ci.org_id = ${orgId} 
            AND ci.deleted_at IS NULL
            AND p.deleted_at IS NULL
            AND p.archived_at IS NULL
          ORDER BY ci.created_at DESC
          LIMIT 200
        `),
        db.execute(sql`
          SELECT DISTINCT p.id, p.name
          FROM projects p
          JOIN project_memberships pm ON pm.project_id = p.id
          WHERE pm.user_id = ${authUser.id} 
            AND pm.status = 'active' 
            AND p.org_id = ${orgId} 
            AND p.status = 'active'
          ORDER BY p.name ASC
        `),
      ]);

      const items: OrganizationCalendarItem[] = (itemRowsRes.rows as any[]).map((r) => ({
        id: r.id,
        projectId: r.projectId,
        projectName: r.projectName,
        title: r.title,
        workType: r.workType || "Standard",
        platform: r.platform || "Instagram",
        stage: r.stage || "draft",
        approvalStatus: r.approvalStatus || "Draft",
        assignedOwnerId: r.assignedOwnerId || undefined,
        assignedOwnerName: r.assignedOwnerName || undefined,
        deadline: r.deadline || undefined,
        scheduledPublicationDate: r.scheduledPublicationDate || undefined,
        submissionDeadline: r.submissionDeadline || undefined,
      }));

      const projectsList: Array<{ id: string; name: string }> = (projectRows.rows as any[]).map((p) => ({
        id: p.id,
        name: p.name,
      }));

      return {
        success: true,
        items,
        projects: projectsList,
        teamMembers: [{ id: authUser.id, name: authUser.fullName }],
        isDesigner: true,
      };
    }

    // 2. Founder / Admin / Organization Scope
    const [itemRowsRes, projectRows, memberRows] = await Promise.all([
      db.execute(sql`
        SELECT 
          ci.id,
          ci.project_id as "projectId",
          p.name as "projectName",
          ci.title,
          COALESCE(ci.work_type, ci.content_type) as "workType",
          ci.platform,
          ci.stage,
          CASE 
            WHEN ci.stage = 'approved' THEN 'Approved'
            WHEN ci.stage = 'in_review' THEN 'Under Review'
            WHEN ci.stage = 'changes_requested' THEN 'Changes Requested'
            ELSE 'Draft'
          END as "approvalStatus",
          ca.assignee_user_id as "assignedOwnerId",
          u.full_name as "assignedOwnerName",
          COALESCE(ci.final_internal_deadline::text, ci.scheduled_publication_date::text, ci.submission_deadline::text) as "deadline",
          ci.scheduled_publication_date::text as "scheduledPublicationDate",
          ci.submission_deadline::text as "submissionDeadline"
        FROM content_items ci
        JOIN projects p ON ci.project_id = p.id
        LEFT JOIN content_assignments ca ON ca.content_item_id = ci.id 
          AND ca.status IN ('assigned', 'accepted', 'in_progress')
        LEFT JOIN users u ON u.id = ca.assignee_user_id
        WHERE ci.org_id = ${orgId} AND ci.deleted_at IS NULL
        ORDER BY ci.created_at DESC
        LIMIT 200
      `),
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(and(eq(projects.orgId, orgId), eq(projects.status, "active"))),
      db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.status, "active"), sql`${users.organizationRole} != 'client'`)),
    ]);

    const items: OrganizationCalendarItem[] = (itemRowsRes.rows as any[]).map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName,
      title: r.title,
      workType: r.workType || "Standard",
      platform: r.platform || "Instagram",
      stage: r.stage || "draft",
      approvalStatus: r.approvalStatus || "Draft",
      assignedOwnerId: r.assignedOwnerId || undefined,
      assignedOwnerName: r.assignedOwnerName || undefined,
      deadline: r.deadline || undefined,
      scheduledPublicationDate: r.scheduledPublicationDate || undefined,
      submissionDeadline: r.submissionDeadline || undefined,
    }));

    return {
      success: true,
      items,
      projects: projectRows,
      teamMembers: memberRows,
      isDesigner: false,
    };
  } catch (err: any) {
    console.error("[getAuthoritativeOrganizationCalendarAction] error:", err);
    return { success: false, items: [], projects: [], teamMembers: [], error: err.message };
  }
}
