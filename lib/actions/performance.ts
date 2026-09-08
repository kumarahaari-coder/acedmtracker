"use server";

import { db } from "../db";
import {
  users,
  projects,
  contentItems,
  contentAssignments,
  workSessions,
  changeRequests,
  employeeCapacitySchedules,
  capacityAdjustments,
  effortStandards,
  projectCommitments,
  projectPerformanceInputs,
  projectMemberships,
} from "../db/schema";
import { getAuthoritativeUser } from "../auth/session";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  PeriodFilter,
  getPeriodDateRange,
  calculateTeamPerformanceOverview,
  calculateEmployeeScorecard,
  calculateProjectPerformance,
  calculateEffortAnalysis,
  TeamPerformanceOverviewDTO,
  EmployeePeriodScorecard,
  ProjectPerformanceScorecard,
  EffortAnalysisRow,
} from "../calculations/operationalEngine";
import { ExecutionProfiler } from "../observability/profiler";
import {
  User,
  Project,
  ContentItem,
  ContentAssignment,
  WorkSession,
  ChangeRequest,
  EmployeeCapacitySchedule,
  CapacityAdjustment,
  EffortStandard,
  ProjectCommitment,
  ProjectPerformanceInput,
} from "../types";

// Note: Legacy full-workspace table hydration was permanently removed to eliminate CPU spikes.

// 1. Performance Overview Action with Bounded PostgreSQL Filtering
export interface PerformanceOverviewFilterOptions {
  period?: PeriodFilter;
  customStart?: string;
  customEnd?: string;
  role?: string;
  projectId?: string;
}

export async function getAuthoritativePerformanceOverviewAction(
  filterOrOptions?: PeriodFilter | PerformanceOverviewFilterOptions,
  argCustomStart?: string,
  argCustomEnd?: string,
  argRole?: string,
  argProjectId?: string
): Promise<{
  success: boolean;
  overview?: TeamPerformanceOverviewDTO;
  projectScorecards?: ProjectPerformanceScorecard[];
  availableProjects?: { id: string; name: string; clientBrand: string }[];
  availableRoles?: string[];
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole === "client") return { success: false, error: "Forbidden for client role" };

    // Normalize parameters
    let filter: PeriodFilter = "this_month";
    let customStart: string | undefined;
    let customEnd: string | undefined;
    let selectedRole: string | undefined;
    let selectedProjectId: string | undefined;

    if (typeof filterOrOptions === "object" && filterOrOptions !== null) {
      filter = filterOrOptions.period || "this_month";
      customStart = filterOrOptions.customStart;
      customEnd = filterOrOptions.customEnd;
      selectedRole = filterOrOptions.role;
      selectedProjectId = filterOrOptions.projectId;
    } else {
      filter = filterOrOptions || "this_month";
      customStart = argCustomStart;
      customEnd = argCustomEnd;
      selectedRole = argRole;
      selectedProjectId = argProjectId;
    }

    const period = getPeriodDateRange(filter, customStart, customEnd);
    const normalizedRole = selectedRole && selectedRole !== "all" ? selectedRole.toLowerCase() : null;

    // 1. Resolve Authorized Projects based on Current User Role
    let authorizedProjects: {
      id: string;
      orgId: string;
      name: string;
      clientName: string | null;
      briefMarkdown: string | null;
      engagementModel: string | null;
      status: string;
      createdAt: Date;
    }[] = [];

    if (authUser.organizationRole === "founder" || authUser.organizationRole === "admin") {
      authorizedProjects = await db
        .select({
          id: projects.id,
          orgId: projects.orgId,
          name: projects.name,
          clientName: projects.clientName,
          briefMarkdown: projects.briefMarkdown,
          engagementModel: projects.engagementModel,
          status: projects.status,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .where(and(eq(projects.orgId, authUser.orgId), sql`${projects.deletedAt} IS NULL`))
        .orderBy(projects.name);
    } else if (authUser.organizationRole === "consultant") {
      authorizedProjects = await db
        .select({
          id: projects.id,
          orgId: projects.orgId,
          name: projects.name,
          clientName: projects.clientName,
          briefMarkdown: projects.briefMarkdown,
          engagementModel: projects.engagementModel,
          status: projects.status,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .innerJoin(
          projectMemberships,
          and(
            eq(projectMemberships.projectId, projects.id),
            eq(projectMemberships.userId, authUser.id),
            eq(projectMemberships.status, "active")
          )
        )
        .where(and(eq(projects.orgId, authUser.orgId), sql`${projects.deletedAt} IS NULL`))
        .orderBy(projects.name);
    } else {
      // Designer / other roles: projects where user has active membership or active/historical assignments
      const [memberProjects, assignedProjects] = await Promise.all([
        db
          .select({
            id: projects.id,
            orgId: projects.orgId,
            name: projects.name,
            clientName: projects.clientName,
            briefMarkdown: projects.briefMarkdown,
            engagementModel: projects.engagementModel,
            status: projects.status,
            createdAt: projects.createdAt,
          })
          .from(projects)
          .innerJoin(
            projectMemberships,
            and(
              eq(projectMemberships.projectId, projects.id),
              eq(projectMemberships.userId, authUser.id),
              eq(projectMemberships.status, "active")
            )
          )
          .where(and(eq(projects.orgId, authUser.orgId), sql`${projects.deletedAt} IS NULL`)),
        db
          .select({
            id: projects.id,
            orgId: projects.orgId,
            name: projects.name,
            clientName: projects.clientName,
            briefMarkdown: projects.briefMarkdown,
            engagementModel: projects.engagementModel,
            status: projects.status,
            createdAt: projects.createdAt,
          })
          .from(projects)
          .innerJoin(
            contentAssignments,
            and(
              eq(contentAssignments.projectId, projects.id),
              eq(contentAssignments.assigneeUserId, authUser.id)
            )
          )
          .where(and(eq(projects.orgId, authUser.orgId), sql`${projects.deletedAt} IS NULL`)),
      ]);

      const seenIds = new Set<string>();
      const combined: typeof memberProjects = [];
      for (const p of [...memberProjects, ...assignedProjects]) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          combined.push(p);
        }
      }
      combined.sort((a, b) => a.name.localeCompare(b.name));
      authorizedProjects = combined;
    }

    const authorizedProjectMap = new Map(authorizedProjects.map((p) => [p.id, p]));
    const availableProjects = authorizedProjects.map((p) => ({
      id: p.id,
      name: p.name,
      clientBrand: p.clientName || "",
    }));

    // 2. Fetch Available Roles in the Organization
    const roleRows = await db
      .selectDistinct({ role: users.organizationRole })
      .from(users)
      .where(
        and(
          eq(users.orgId, authUser.orgId),
          sql`${users.deletedAt} IS NULL`,
          sql`${users.organizationRole} != 'client'`
        )
      )
      .orderBy(users.organizationRole);
    const availableRoles = roleRows.map((r) => r.role);

    // 3. Validate and Scope Selected Project
    let targetProjectIds: string[];
    if (selectedProjectId && selectedProjectId !== "all") {
      if (!authorizedProjectMap.has(selectedProjectId)) {
        return { success: false, error: "Forbidden: Unauthorized project access" };
      }
      targetProjectIds = [selectedProjectId];
    } else {
      targetProjectIds = authorizedProjects.map((p) => p.id);
    }

    // 4. Resolve Scoped Candidate Users
    let candidateUsers: {
      id: string;
      fullName: string;
      email: string;
      avatarUrl: string | null;
      organizationRole: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }[] = [];

    const roleCondition = normalizedRole
      ? sql`LOWER(${users.organizationRole}) = ${normalizedRole}`
      : sql`true`;

    if (authUser.organizationRole === "designer") {
      // Designers only see their own metrics
      if (normalizedRole && normalizedRole !== "designer") {
        candidateUsers = [];
      } else {
        const [me] = await db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            avatarUrl: users.avatarUrl,
            organizationRole: users.organizationRole,
            status: users.status,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(eq(users.id, authUser.id))
          .limit(1);
        candidateUsers = me ? [me] : [];
      }
    } else if (selectedProjectId && selectedProjectId !== "all") {
      // Bounded to users who have membership, assignments, or work sessions on this project
      const memberOrActiveUsers = await db
        .selectDistinct({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          avatarUrl: users.avatarUrl,
          organizationRole: users.organizationRole,
          status: users.status,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .leftJoin(
          projectMemberships,
          and(
            eq(projectMemberships.userId, users.id),
            eq(projectMemberships.projectId, selectedProjectId),
            eq(projectMemberships.status, "active")
          )
        )
        .leftJoin(
          contentAssignments,
          and(
            eq(contentAssignments.assigneeUserId, users.id),
            eq(contentAssignments.projectId, selectedProjectId)
          )
        )
        .leftJoin(
          workSessions,
          and(
            eq(workSessions.userId, users.id),
            eq(workSessions.projectId, selectedProjectId)
          )
        )
        .where(
          and(
            eq(users.orgId, authUser.orgId),
            sql`${users.deletedAt} IS NULL`,
            sql`${users.organizationRole} != 'client'`,
            sql`(${projectMemberships.id} IS NOT NULL OR ${contentAssignments.id} IS NOT NULL OR ${workSessions.id} IS NOT NULL)`,
            roleCondition
          )
        )
        .orderBy(users.fullName);
      candidateUsers = memberOrActiveUsers;
    } else {
      // All organization active internal users
      candidateUsers = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          avatarUrl: users.avatarUrl,
          organizationRole: users.organizationRole,
          status: users.status,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(
          and(
            eq(users.orgId, authUser.orgId),
            sql`${users.deletedAt} IS NULL`,
            eq(users.status, "active"),
            sql`${users.organizationRole} != 'client'`,
            roleCondition
          )
        )
        .orderBy(users.fullName);
    }

    const emptyOverview: TeamPerformanceOverviewDTO & { onTimePercentage: number | null } = {
      period,
      teamCapacityHours: 0,
      teamAssignedHours: 0,
      teamActualHours: 0,
      teamRemainingHours: 0,
      teamAllocationPercent: 0,
      teamUtilizationPercent: 0,
      completedTasksCount: 0,
      onTimePercent: null,
      onTimePercentage: null,
      reworkIncidencePercent: null,
      adHocHours: 0,
      goodwillHours: 0,
      overdueTasksCount: 0,
      activeTimersCount: 0,
      employeeScorecards: [],
    };

    // If no candidate users or no target projects match the filter intersection
    if (candidateUsers.length === 0 || targetProjectIds.length === 0) {
      return {
        success: true,
        overview: emptyOverview,
        projectScorecards: [],
        availableProjects,
        availableRoles,
      };
    }

    // 5. Run Scoped, Bounded Single Consolidated PostgreSQL Query
    const targetUserIds = candidateUsers.map((u) => u.id);
    const startTimestamp = `${period.startDate}T00:00:00.000Z`;
    const endTimestamp = `${period.endDate}T23:59:59.999Z`;

    const pSql = sql.join(targetProjectIds.map((id) => sql`${id}::uuid`), sql`, `);
    const uSql = sql.join(targetUserIds.map((id) => sql`${id}::uuid`), sql`, `);

    const queryRes: any = await db.execute(sql`
      WITH
        p_ids AS (SELECT UNNEST(ARRAY[${pSql}]) AS id),
        u_ids AS (SELECT UNNEST(ARRAY[${uSql}]) AS id),
        scoped_items AS (
          SELECT id, project_id, content_group_id, title, platform, content_type, work_type, work_type_id,
                 stage, submission_deadline, scheduled_publication_date, final_planned_seconds,
                 standard_content_seconds, standard_production_seconds, is_effort_anchor,
                 completed_at, published_at, final_internal_deadline, calculated_internal_deadline,
                 created_at, work_nature, scope_classification
          FROM content_items
          WHERE org_id = ${authUser.orgId}
            AND project_id IN (SELECT id FROM p_ids)
            AND deleted_at IS NULL
        ),
        scoped_assignments AS (
          SELECT id, org_id, project_id, content_item_id, assignee_user_id, assignment_role, status,
                 current_due_at, initial_due_at, created_at
          FROM content_assignments
          WHERE org_id = ${authUser.orgId}
            AND project_id IN (SELECT id FROM p_ids)
            AND assignee_user_id IN (SELECT id FROM u_ids)
        ),
        scoped_sessions AS (
          SELECT id, org_id, project_id, content_item_id, user_id, started_at, ended_at,
                 accumulated_seconds, status, created_at, updated_at
          FROM work_sessions
          WHERE org_id = ${authUser.orgId}
            AND project_id IN (SELECT id FROM p_ids)
            AND user_id IN (SELECT id FROM u_ids)
            AND (status = 'active' OR (started_at >= ${startTimestamp}::timestamptz AND started_at <= ${endTimestamp}::timestamptz))
        ),
        scoped_crs AS (
          SELECT id, project_id, content_item_id, submission_version_id, component, reviewer_user_id,
                 requested_change, priority, status, created_at
          FROM change_requests
          WHERE org_id = ${authUser.orgId}
            AND project_id IN (SELECT id FROM p_ids)
        ),
        scoped_schedules AS (
          SELECT id, org_id, user_id, effective_from, effective_to, monday_hours, tuesday_hours,
                 wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours,
                 primary_function, creative_eligibility, created_at, updated_at
          FROM employee_capacity_schedules
          WHERE org_id = ${authUser.orgId}
            AND user_id IN (SELECT id FROM u_ids)
        ),
        scoped_adjustments AS (
          SELECT id, org_id, user_id, adjustment_date, kind, adjustment_hours, reason,
                 created_by_user_id, created_at
          FROM capacity_adjustments
          WHERE org_id = ${authUser.orgId}
            AND user_id IN (SELECT id FROM u_ids)
            AND adjustment_date >= ${period.startDate} AND adjustment_date <= ${period.endDate}
        ),
        scoped_commitments AS (
          SELECT id, org_id, project_id, work_type_id, work_type_name, committed_quantity,
                 effective_month, created_at, updated_at
          FROM project_commitments
          WHERE org_id = ${authUser.orgId}
            AND project_id IN (SELECT id FROM p_ids)
        ),
        scoped_perf_inputs AS (
          SELECT id, org_id, project_id, campaign_id, effective_month, currency, ad_budget,
                 ad_spend, leads, conversions, created_at, updated_at
          FROM project_performance_inputs
          WHERE org_id = ${authUser.orgId}
            AND project_id IN (SELECT id FROM p_ids)
        )
      SELECT
        (SELECT COALESCE(json_agg(i), '[]'::json) FROM scoped_items i) AS items,
        (SELECT COALESCE(json_agg(a), '[]'::json) FROM scoped_assignments a) AS assignments,
        (SELECT COALESCE(json_agg(s), '[]'::json) FROM scoped_sessions s) AS sessions,
        (SELECT COALESCE(json_agg(c), '[]'::json) FROM scoped_crs c) AS crs,
        (SELECT COALESCE(json_agg(sc), '[]'::json) FROM scoped_schedules sc) AS schedules,
        (SELECT COALESCE(json_agg(ad), '[]'::json) FROM scoped_adjustments ad) AS adjustments,
        (SELECT COALESCE(json_agg(cm), '[]'::json) FROM scoped_commitments cm) AS commitments,
        (SELECT COALESCE(json_agg(pi), '[]'::json) FROM scoped_perf_inputs pi) AS perf_inputs;
    `);
    const batch: any = queryRes.rows?.[0] || queryRes?.[0] || {};

    // 6. Map Domain Models
    const mappedUsers: User[] = candidateUsers.map((u) => ({
      id: u.id,
      name: u.fullName,
      email: u.email,
      avatar: u.avatarUrl || "",
      role: u.organizationRole as any,
      status: u.status as any,
      workingHoursPerDay: 8,
      dateJoined: u.createdAt.toISOString(),
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));

    const mappedProjects: Project[] = authorizedProjects
      .filter((p) => targetProjectIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        clientBrand: p.clientName || "",
        avatar: "",
        scope: p.briefMarkdown || p.engagementModel || "",
        timezone: "Asia/Kolkata",
        status: p.status as any,
        targetRequirements: { posts: 0, carousels: 0, reels: 0, trialReels: 0 },
        workflowStages: ["idea", "draft", "in_review", "approved", "published"],
        createdAt: p.createdAt.toISOString(),
      }));

    const mappedItems: ContentItem[] = (batch?.items || []).map((i: any) => ({
      id: i.id,
      projectId: i.project_id,
      campaignId: i.campaign_id || undefined,
      contentGroupId: i.content_group_id || undefined,
      title: i.title,
      platform: i.platform as any,
      contentType: i.content_type as any,
      workType: i.work_type || undefined,
      workTypeId: i.work_type_id || undefined,
      contentPillar: undefined,
      topic: undefined,
      brief: undefined,
      referenceLink: undefined,
      priority: "normal",
      workNature: (i.work_nature || "planned") as any,
      scopeClassification: i.scope_classification as any,
      accountOwnerId: undefined,
      stage: i.stage as any,
      accountableOwnerId: "",
      collaboratorIds: [],
      deadlines: {
        submissionDeadline: i.submission_deadline || undefined,
        scheduledPublicationDate: i.scheduled_publication_date || undefined,
      },
      finalPlannedSeconds: i.final_planned_seconds !== undefined && i.final_planned_seconds !== null ? Number(i.final_planned_seconds) : undefined,
      standardContentSeconds: i.standard_content_seconds !== undefined && i.standard_content_seconds !== null ? Number(i.standard_content_seconds) : undefined,
      standardProductionSeconds: i.standard_production_seconds !== undefined && i.standard_production_seconds !== null ? Number(i.standard_production_seconds) : undefined,
      isEffortAnchor: i.is_effort_anchor,
      completedAt: i.completed_at || undefined,
      publishedAt: i.published_at || undefined,
      finalInternalDeadline: i.final_internal_deadline || undefined,
      calculatedInternalDeadline: i.calculated_internal_deadline || undefined,
      createdAt: i.created_at ? new Date(i.created_at).toISOString() : new Date().toISOString(),
      updatedAt: i.created_at ? new Date(i.created_at).toISOString() : new Date().toISOString(),
    }));

    const mappedAssignments: ContentAssignment[] = (batch?.assignments || []).map((a: any) => ({
      id: a.id,
      orgId: a.org_id,
      projectId: a.project_id,
      contentItemId: a.content_item_id,
      assigneeUserId: a.assignee_user_id,
      role: (a.assignment_role || a.role || "designer") as any,
      status: a.status as any,
      assignedByUserId: "",
      assignedAt: a.created_at,
      initialDueAt: a.initial_due_at || undefined,
      currentDueAt: a.current_due_at || undefined,
      createdAt: a.created_at,
      updatedAt: a.created_at,
    }));

    const mappedSessions: WorkSession[] = (batch?.sessions || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      projectId: s.project_id,
      contentItemId: s.content_item_id || undefined,
      userId: s.user_id,
      startedAt: typeof s.started_at === "string" ? s.started_at : new Date(s.started_at).toISOString(),
      endedAt: s.ended_at ? (typeof s.ended_at === "string" ? s.ended_at : new Date(s.ended_at).toISOString()) : undefined,
      accumulatedSeconds: s.accumulated_seconds,
      status: s.status as any,
      adjustments: [],
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const mappedCRs: ChangeRequest[] = (batch?.crs || []).map((cr: any) => ({
      id: cr.id,
      projectId: cr.project_id,
      contentItemId: cr.content_item_id,
      submissionVersionId: cr.submission_version_id,
      component: cr.component as any,
      reviewerUserId: cr.reviewer_user_id,
      reviewerName: "",
      requestedChange: cr.requested_change,
      priority: cr.priority as any,
      status: cr.status as any,
      createdAt: typeof cr.created_at === "string" ? cr.created_at : new Date(cr.created_at).toISOString(),
    }));

    const mappedSchedules: EmployeeCapacitySchedule[] = (batch?.schedules || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      userId: s.user_id,
      effectiveFrom: s.effective_from,
      effectiveTo: s.effective_to,
      mondayHours: Number(s.monday_hours),
      tuesdayHours: Number(s.tuesday_hours),
      wednesdayHours: Number(s.wednesday_hours),
      thursdayHours: Number(s.thursday_hours),
      fridayHours: Number(s.friday_hours),
      saturdayHours: Number(s.saturday_hours),
      sundayHours: Number(s.sunday_hours),
      primaryFunction: s.primary_function,
      creativeEligibility: s.creative_eligibility as any,
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const mappedAdjustments: CapacityAdjustment[] = (batch?.adjustments || []).map((a: any) => ({
      id: a.id,
      orgId: a.org_id,
      userId: a.user_id,
      adjustmentDate: a.adjustment_date,
      kind: a.kind as any,
      adjustmentHours: Number(a.adjustment_hours),
      reason: a.reason,
      createdByUserId: a.created_by_user_id || undefined,
      createdAt: typeof a.created_at === "string" ? a.created_at : new Date(a.created_at).toISOString(),
    }));

    const mappedCommitments: ProjectCommitment[] = (batch?.commitments || []).map((c: any) => ({
      id: c.id,
      orgId: c.org_id,
      projectId: c.project_id,
      workTypeId: c.work_type_id || undefined,
      workTypeName: c.work_type_name,
      committedQuantity: c.committed_quantity,
      effectiveMonth: c.effective_month,
      createdAt: typeof c.created_at === "string" ? c.created_at : new Date(c.created_at).toISOString(),
      updatedAt: typeof c.updated_at === "string" ? c.updated_at : new Date(c.updated_at).toISOString(),
    }));

    const mappedPerfInputs: ProjectPerformanceInput[] = (batch?.perf_inputs || []).map((p: any) => ({
      id: p.id,
      orgId: p.org_id,
      projectId: p.project_id,
      campaignId: p.campaign_id || undefined,
      effectiveMonth: p.effective_month,
      currency: p.currency,
      adBudget: Number(p.ad_budget),
      adSpend: Number(p.ad_spend),
      leads: p.leads,
      conversions: p.conversions,
      createdAt: typeof p.created_at === "string" ? p.created_at : new Date(p.created_at).toISOString(),
      updatedAt: typeof p.updated_at === "string" ? p.updated_at : new Date(p.updated_at).toISOString(),
    }));

    // 7. Calculate Aggregations and Scorecards
    const overview = calculateTeamPerformanceOverview(
      mappedUsers,
      period,
      mappedItems,
      mappedAssignments,
      mappedSessions,
      mappedCRs,
      mappedSchedules,
      mappedAdjustments
    );

    const projectScorecards = mappedProjects.map((p) =>
      calculateProjectPerformance(p, period, mappedItems, mappedSessions, mappedCommitments, mappedPerfInputs)
    );

    return {
      success: true,
      overview: {
        ...overview,
        onTimePercentage: overview.onTimePercent,
      },
      projectScorecards,
      availableProjects,
      availableRoles,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 2. Team Capacity Action (Bounded Single CTE Query)
export async function getAuthoritativeTeamCapacityAction(
  filter: PeriodFilter = "this_week",
  customStart?: string,
  customEnd?: string
): Promise<{
  success: boolean;
  scorecards: EmployeePeriodScorecard[];
  period?: any;
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, scorecards: [], error: "Unauthorized" };
    if (authUser.organizationRole === "client") return { success: false, scorecards: [], error: "Forbidden" };

    const period = getPeriodDateRange(filter, customStart, customEnd);
    const startTimestamp = `${period.startDate}T00:00:00.000Z`;
    const endTimestamp = `${period.endDate}T23:59:59.999Z`;

    const queryRes: any = await db.execute(sql`
      WITH
        target_users AS (
          SELECT id, full_name, email, avatar_url, organization_role, status, created_at, updated_at
          FROM users
          WHERE org_id = ${authUser.orgId}
            AND deleted_at IS NULL
            AND status = 'active'
            AND organization_role != 'client'
            ${authUser.organizationRole === "designer" ? sql`AND id = ${authUser.id}` : sql``}
          ORDER BY full_name
        ),
        u_ids AS (SELECT id FROM target_users),
        scoped_items AS (
          SELECT id, project_id, content_group_id, title, platform, content_type, work_type, work_type_id,
                 stage, submission_deadline, scheduled_publication_date, final_planned_seconds,
                 standard_content_seconds, standard_production_seconds, is_effort_anchor,
                 completed_at, published_at, final_internal_deadline, calculated_internal_deadline
          FROM content_items
          WHERE org_id = ${authUser.orgId} AND deleted_at IS NULL
        ),
        scoped_assignments AS (
          SELECT id, org_id, project_id, content_item_id, assignee_user_id, assignment_role, status,
                 current_due_at, initial_due_at, created_at
          FROM content_assignments
          WHERE org_id = ${authUser.orgId} AND assignee_user_id IN (SELECT id FROM u_ids)
        ),
        scoped_sessions AS (
          SELECT id, org_id, project_id, content_item_id, user_id, started_at, ended_at,
                 accumulated_seconds, status, created_at, updated_at
          FROM work_sessions
          WHERE org_id = ${authUser.orgId} AND user_id IN (SELECT id FROM u_ids)
            AND (status = 'active' OR (started_at >= ${startTimestamp}::timestamptz AND started_at <= ${endTimestamp}::timestamptz))
        ),
        scoped_crs AS (
          SELECT id, project_id, content_item_id, submission_version_id, component, reviewer_user_id,
                 requested_change, priority, status, created_at
          FROM change_requests
          WHERE org_id = ${authUser.orgId}
        ),
        scoped_schedules AS (
          SELECT id, org_id, user_id, effective_from, effective_to, monday_hours, tuesday_hours,
                 wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours,
                 primary_function, creative_eligibility, created_at, updated_at
          FROM employee_capacity_schedules
          WHERE org_id = ${authUser.orgId} AND user_id IN (SELECT id FROM u_ids)
        ),
        scoped_adjustments AS (
          SELECT id, org_id, user_id, adjustment_date, kind, adjustment_hours, reason,
                 created_by_user_id, created_at
          FROM capacity_adjustments
          WHERE org_id = ${authUser.orgId} AND user_id IN (SELECT id FROM u_ids)
            AND adjustment_date >= ${period.startDate} AND adjustment_date <= ${period.endDate}
        )
      SELECT
        (SELECT COALESCE(json_agg(u), '[]'::json) FROM target_users u) AS users,
        (SELECT COALESCE(json_agg(i), '[]'::json) FROM scoped_items i) AS items,
        (SELECT COALESCE(json_agg(a), '[]'::json) FROM scoped_assignments a) AS assignments,
        (SELECT COALESCE(json_agg(s), '[]'::json) FROM scoped_sessions s) AS sessions,
        (SELECT COALESCE(json_agg(c), '[]'::json) FROM scoped_crs c) AS crs,
        (SELECT COALESCE(json_agg(sc), '[]'::json) FROM scoped_schedules sc) AS schedules,
        (SELECT COALESCE(json_agg(ad), '[]'::json) FROM scoped_adjustments ad) AS adjustments;
    `);
    const batch: any = queryRes.rows?.[0] || queryRes?.[0] || {};

    const mappedUsers: User[] = (batch?.users || []).map((u: any) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      avatar: u.avatar_url || "",
      role: u.organization_role as any,
      status: u.status as any,
      workingHoursPerDay: 8,
      dateJoined: u.created_at,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));

    const mappedItems: ContentItem[] = (batch?.items || []).map((i: any) => ({
      id: i.id,
      projectId: i.project_id,
      campaignId: i.campaign_id || undefined,
      contentGroupId: i.content_group_id || undefined,
      title: i.title,
      platform: i.platform as any,
      contentType: i.content_type as any,
      workType: i.work_type || undefined,
      workTypeId: i.work_type_id || undefined,
      stage: i.stage as any,
      accountableOwnerId: "",
      deadlines: {
        submissionDeadline: i.submission_deadline || undefined,
        scheduledPublicationDate: i.scheduled_publication_date || undefined,
      },
      finalPlannedSeconds: i.final_planned_seconds,
      standardContentSeconds: i.standard_content_seconds,
      standardProductionSeconds: i.standard_production_seconds,
      isEffortAnchor: i.is_effort_anchor,
      completedAt: i.completed_at || undefined,
      publishedAt: i.published_at || undefined,
      finalInternalDeadline: i.final_internal_deadline || undefined,
      calculatedInternalDeadline: i.calculated_internal_deadline || undefined,
    }));

    const mappedAssignments: ContentAssignment[] = (batch?.assignments || []).map((a: any) => ({
      id: a.id,
      orgId: a.org_id,
      projectId: a.project_id,
      contentItemId: a.content_item_id,
      assigneeUserId: a.assignee_user_id,
      role: (a.assignment_role || a.role || "designer") as any,
      status: a.status as any,
      initialDueAt: a.initial_due_at || undefined,
      currentDueAt: a.current_due_at || undefined,
      createdAt: a.created_at,
    }));

    const mappedSessions: WorkSession[] = (batch?.sessions || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      projectId: s.project_id,
      contentItemId: s.content_item_id || undefined,
      userId: s.user_id,
      startedAt: typeof s.started_at === "string" ? s.started_at : new Date(s.started_at).toISOString(),
      endedAt: s.ended_at ? (typeof s.ended_at === "string" ? s.ended_at : new Date(s.ended_at).toISOString()) : undefined,
      accumulatedSeconds: s.accumulated_seconds,
      status: s.status as any,
      adjustments: [],
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const mappedCRs: ChangeRequest[] = (batch?.crs || []).map((cr: any) => ({
      id: cr.id,
      projectId: cr.project_id,
      contentItemId: cr.content_item_id,
      submissionVersionId: cr.submission_version_id,
      component: cr.component as any,
      reviewerUserId: cr.reviewer_user_id,
      reviewerName: "",
      requestedChange: cr.requested_change,
      priority: cr.priority as any,
      status: cr.status as any,
      createdAt: typeof cr.created_at === "string" ? cr.created_at : new Date(cr.created_at).toISOString(),
    }));

    const mappedSchedules: EmployeeCapacitySchedule[] = (batch?.schedules || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      userId: s.user_id,
      effectiveFrom: s.effective_from,
      effectiveTo: s.effective_to,
      mondayHours: Number(s.monday_hours),
      tuesdayHours: Number(s.tuesday_hours),
      wednesdayHours: Number(s.wednesday_hours),
      thursdayHours: Number(s.thursday_hours),
      fridayHours: Number(s.friday_hours),
      saturdayHours: Number(s.saturday_hours),
      sundayHours: Number(s.sunday_hours),
      primaryFunction: s.primary_function,
      creativeEligibility: s.creative_eligibility as any,
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const mappedAdjustments: CapacityAdjustment[] = (batch?.adjustments || []).map((a: any) => ({
      id: a.id,
      orgId: a.org_id,
      userId: a.user_id,
      adjustmentDate: a.adjustment_date,
      kind: a.kind as any,
      adjustmentHours: Number(a.adjustment_hours),
      reason: a.reason,
      createdByUserId: a.created_by_user_id || undefined,
      createdAt: typeof a.created_at === "string" ? a.created_at : new Date(a.created_at).toISOString(),
    }));

    const scorecards = mappedUsers.map((u) =>
      calculateEmployeeScorecard(
        u,
        period,
        mappedItems,
        mappedAssignments,
        mappedSessions,
        mappedCRs,
        mappedSchedules,
        mappedAdjustments
      )
    );

    return { success: true, scorecards, period };
  } catch (error: any) {
    return { success: false, scorecards: [], error: error.message };
  }
}

// 3. Employee Detailed Drilldown Action (Bounded Single User Query)
export async function getAuthoritativeEmployeePerformanceAction(
  userId: string,
  filter: PeriodFilter = "this_month",
  customStart?: string,
  customEnd?: string
): Promise<{
  success: boolean;
  scorecard?: EmployeePeriodScorecard;
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole === "client") return { success: false, error: "Forbidden" };

    // Designer Security Gate: Designers CANNOT view another user's performance metrics
    if (authUser.organizationRole === "designer" && userId !== authUser.id) {
      return { success: false, error: "Unauthorized: Designers can only view their own performance metrics." };
    }

    const period = getPeriodDateRange(filter, customStart, customEnd);
    const startTimestamp = `${period.startDate}T00:00:00.000Z`;
    const endTimestamp = `${period.endDate}T23:59:59.999Z`;

    const queryRes: any = await db.execute(sql`
      WITH
        target_user AS (
          SELECT id, full_name, email, avatar_url, organization_role, status, created_at, updated_at
          FROM users WHERE id = ${userId} AND org_id = ${authUser.orgId} AND deleted_at IS NULL
        ),
        scoped_assignments AS (
          SELECT id, org_id, project_id, content_item_id, assignee_user_id, assignment_role, status,
                 current_due_at, initial_due_at, created_at
          FROM content_assignments
          WHERE org_id = ${authUser.orgId} AND assignee_user_id = ${userId}
        ),
        scoped_items AS (
          SELECT id, project_id, content_group_id, title, platform, content_type, work_type, work_type_id,
                 stage, submission_deadline, scheduled_publication_date, final_planned_seconds,
                 standard_content_seconds, standard_production_seconds, is_effort_anchor,
                 completed_at, published_at, final_internal_deadline, calculated_internal_deadline
          FROM content_items
          WHERE org_id = ${authUser.orgId}
            AND (id IN (SELECT content_item_id FROM scoped_assignments) OR account_owner_id = ${userId})
            AND deleted_at IS NULL
        ),
        scoped_sessions AS (
          SELECT id, org_id, project_id, content_item_id, user_id, started_at, ended_at,
                 accumulated_seconds, status, created_at, updated_at
          FROM work_sessions
          WHERE org_id = ${authUser.orgId} AND user_id = ${userId}
            AND (status = 'active' OR (started_at >= ${startTimestamp}::timestamptz AND started_at <= ${endTimestamp}::timestamptz))
        ),
        scoped_crs AS (
          SELECT id, project_id, content_item_id, submission_version_id, component, reviewer_user_id,
                 requested_change, priority, status, created_at
          FROM change_requests
          WHERE org_id = ${authUser.orgId} AND content_item_id IN (SELECT id FROM scoped_items)
        ),
        scoped_schedules AS (
          SELECT id, org_id, user_id, effective_from, effective_to, monday_hours, tuesday_hours,
                 wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours,
                 primary_function, creative_eligibility, created_at, updated_at
          FROM employee_capacity_schedules
          WHERE org_id = ${authUser.orgId} AND user_id = ${userId}
        ),
        scoped_adjustments AS (
          SELECT id, org_id, user_id, adjustment_date, kind, adjustment_hours, reason,
                 created_by_user_id, created_at
          FROM capacity_adjustments
          WHERE org_id = ${authUser.orgId} AND user_id = ${userId}
            AND adjustment_date >= ${period.startDate} AND adjustment_date <= ${period.endDate}
        )
      SELECT
        (SELECT json_agg(u) FROM target_user u) AS users,
        (SELECT COALESCE(json_agg(i), '[]'::json) FROM scoped_items i) AS items,
        (SELECT COALESCE(json_agg(a), '[]'::json) FROM scoped_assignments a) AS assignments,
        (SELECT COALESCE(json_agg(s), '[]'::json) FROM scoped_sessions s) AS sessions,
        (SELECT COALESCE(json_agg(c), '[]'::json) FROM scoped_crs c) AS crs,
        (SELECT COALESCE(json_agg(sc), '[]'::json) FROM scoped_schedules sc) AS schedules,
        (SELECT COALESCE(json_agg(ad), '[]'::json) FROM scoped_adjustments ad) AS adjustments;
    `);
    const batch: any = queryRes.rows?.[0] || queryRes?.[0] || {};

    const userRaw = (batch?.users || [])[0];
    if (!userRaw) return { success: false, error: "User not found" };

    const targetUser: User = {
      id: userRaw.id,
      name: userRaw.full_name,
      email: userRaw.email,
      avatar: userRaw.avatar_url || "",
      role: userRaw.organization_role as any,
      status: userRaw.status as any,
      workingHoursPerDay: 8,
      dateJoined: userRaw.created_at,
      createdAt: userRaw.created_at,
      updatedAt: userRaw.updated_at,
    };

    const mappedItems: ContentItem[] = (batch?.items || []).map((i: any) => ({
      id: i.id,
      projectId: i.project_id,
      campaignId: i.campaign_id || undefined,
      contentGroupId: i.content_group_id || undefined,
      title: i.title,
      platform: i.platform as any,
      contentType: i.content_type as any,
      workType: i.work_type || undefined,
      workTypeId: i.work_type_id || undefined,
      stage: i.stage as any,
      accountableOwnerId: "",
      deadlines: {
        submissionDeadline: i.submission_deadline || undefined,
        scheduledPublicationDate: i.scheduled_publication_date || undefined,
      },
      finalPlannedSeconds: i.final_planned_seconds,
      standardContentSeconds: i.standard_content_seconds,
      standardProductionSeconds: i.standard_production_seconds,
      isEffortAnchor: i.is_effort_anchor,
      completedAt: i.completed_at || undefined,
      publishedAt: i.published_at || undefined,
      finalInternalDeadline: i.final_internal_deadline || undefined,
      calculatedInternalDeadline: i.calculated_internal_deadline || undefined,
    }));

    const mappedAssignments: ContentAssignment[] = (batch?.assignments || []).map((a: any) => ({
      id: a.id,
      orgId: a.org_id,
      projectId: a.project_id,
      contentItemId: a.content_item_id,
      assigneeUserId: a.assignee_user_id,
      role: (a.assignment_role || a.role || "designer") as any,
      status: a.status as any,
      initialDueAt: a.initial_due_at || undefined,
      currentDueAt: a.current_due_at || undefined,
      createdAt: a.created_at,
    }));

    const mappedSessions: WorkSession[] = (batch?.sessions || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      projectId: s.project_id,
      contentItemId: s.content_item_id || undefined,
      userId: s.user_id,
      startedAt: typeof s.started_at === "string" ? s.started_at : new Date(s.started_at).toISOString(),
      endedAt: s.ended_at ? (typeof s.ended_at === "string" ? s.ended_at : new Date(s.ended_at).toISOString()) : undefined,
      accumulatedSeconds: s.accumulated_seconds,
      status: s.status as any,
      adjustments: [],
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const mappedCRs: ChangeRequest[] = (batch?.crs || []).map((cr: any) => ({
      id: cr.id,
      projectId: cr.project_id,
      contentItemId: cr.content_item_id,
      submissionVersionId: cr.submission_version_id,
      component: cr.component as any,
      reviewerUserId: cr.reviewer_user_id,
      reviewerName: "",
      requestedChange: cr.requested_change,
      priority: cr.priority as any,
      status: cr.status as any,
      createdAt: typeof cr.created_at === "string" ? cr.created_at : new Date(cr.created_at).toISOString(),
    }));

    const mappedSchedules: EmployeeCapacitySchedule[] = (batch?.schedules || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      userId: s.user_id,
      effectiveFrom: s.effective_from,
      effectiveTo: s.effective_to,
      mondayHours: Number(s.monday_hours),
      tuesdayHours: Number(s.tuesday_hours),
      wednesdayHours: Number(s.wednesday_hours),
      thursdayHours: Number(s.thursday_hours),
      fridayHours: Number(s.friday_hours),
      saturdayHours: Number(s.saturday_hours),
      sundayHours: Number(s.sunday_hours),
      primaryFunction: s.primary_function,
      creativeEligibility: s.creative_eligibility as any,
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const mappedAdjustments: CapacityAdjustment[] = (batch?.adjustments || []).map((a: any) => ({
      id: a.id,
      orgId: a.org_id,
      userId: a.user_id,
      adjustmentDate: a.adjustment_date,
      kind: a.kind as any,
      adjustmentHours: Number(a.adjustment_hours),
      reason: a.reason,
      createdByUserId: a.created_by_user_id || undefined,
      createdAt: typeof a.created_at === "string" ? a.created_at : new Date(a.created_at).toISOString(),
    }));

    const scorecard = calculateEmployeeScorecard(
      targetUser,
      period,
      mappedItems,
      mappedAssignments,
      mappedSessions,
      mappedCRs,
      mappedSchedules,
      mappedAdjustments
    );

    return { success: true, scorecard };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 4. Projects Performance Action (Bounded Single CTE Query)
export async function getAuthoritativeProjectsPerformanceAction(
  filter: PeriodFilter = "this_month",
  customStart?: string,
  customEnd?: string
): Promise<{
  success: boolean;
  projectScorecards: ProjectPerformanceScorecard[];
  period?: any;
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, projectScorecards: [], error: "Unauthorized" };
    if (authUser.organizationRole === "client") return { success: false, projectScorecards: [], error: "Forbidden" };

    const period = getPeriodDateRange(filter, customStart, customEnd);
    const startTimestamp = `${period.startDate}T00:00:00.000Z`;
    const endTimestamp = `${period.endDate}T23:59:59.999Z`;

    const queryRes: any = await db.execute(sql`
      WITH
        target_projects AS (
          SELECT id, name, client_name, brief_markdown, engagement_model, status, created_at
          FROM projects
          WHERE org_id = ${authUser.orgId}
            AND deleted_at IS NULL
            ${
              authUser.organizationRole === "consultant"
                ? sql`AND id IN (SELECT project_id FROM project_memberships WHERE user_id = ${authUser.id} AND status = 'active')`
                : sql``
            }
          ORDER BY name
        ),
        p_ids AS (SELECT id FROM target_projects),
        scoped_items AS (
          SELECT id, project_id, content_group_id, title, platform, content_type, work_type, work_type_id,
                 stage, submission_deadline, scheduled_publication_date, final_planned_seconds,
                 standard_content_seconds, standard_production_seconds, is_effort_anchor,
                 completed_at, published_at, final_internal_deadline, calculated_internal_deadline
          FROM content_items
          WHERE org_id = ${authUser.orgId} AND project_id IN (SELECT id FROM p_ids) AND deleted_at IS NULL
        ),
        scoped_sessions AS (
          SELECT id, org_id, project_id, content_item_id, user_id, started_at, ended_at,
                 accumulated_seconds, status, created_at, updated_at
          FROM work_sessions
          WHERE org_id = ${authUser.orgId} AND project_id IN (SELECT id FROM p_ids)
            AND (status = 'active' OR (started_at >= ${startTimestamp}::timestamptz AND started_at <= ${endTimestamp}::timestamptz))
        ),
        scoped_commitments AS (
          SELECT id, org_id, project_id, work_type_id, work_type_name, committed_quantity,
                 effective_month, created_at, updated_at
          FROM project_commitments
          WHERE org_id = ${authUser.orgId} AND project_id IN (SELECT id FROM p_ids)
        ),
        scoped_perf_inputs AS (
          SELECT id, org_id, project_id, campaign_id, effective_month, currency, ad_budget,
                 ad_spend, leads, conversions, created_at, updated_at
          FROM project_performance_inputs
          WHERE org_id = ${authUser.orgId} AND project_id IN (SELECT id FROM p_ids)
        )
      SELECT
        (SELECT COALESCE(json_agg(p), '[]'::json) FROM target_projects p) AS projects,
        (SELECT COALESCE(json_agg(i), '[]'::json) FROM scoped_items i) AS items,
        (SELECT COALESCE(json_agg(s), '[]'::json) FROM scoped_sessions s) AS sessions,
        (SELECT COALESCE(json_agg(cm), '[]'::json) FROM scoped_commitments cm) AS commitments,
        (SELECT COALESCE(json_agg(pi), '[]'::json) FROM scoped_perf_inputs pi) AS perf_inputs;
    `);
    const batch: any = queryRes.rows?.[0] || queryRes?.[0] || {};

    const mappedProjects: Project[] = (batch?.projects || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      clientBrand: p.client_name || "",
      avatar: "",
      scope: p.brief_markdown || p.engagement_model || "",
      timezone: "Asia/Kolkata",
      status: p.status,
      targetRequirements: { posts: 0, carousels: 0, reels: 0, trialReels: 0 },
      workflowStages: ["idea", "draft", "in_review", "approved", "published"],
      createdAt: p.created_at,
    }));

    const mappedItems: ContentItem[] = (batch?.items || []).map((i: any) => ({
      id: i.id,
      projectId: i.project_id,
      campaignId: i.campaign_id || undefined,
      contentGroupId: i.content_group_id || undefined,
      title: i.title,
      platform: i.platform as any,
      contentType: i.content_type as any,
      workType: i.work_type || undefined,
      workTypeId: i.work_type_id || undefined,
      stage: i.stage as any,
      deadlines: {
        submissionDeadline: i.submission_deadline || undefined,
        scheduledPublicationDate: i.scheduled_publication_date || undefined,
      },
      finalPlannedSeconds: i.final_planned_seconds,
      standardContentSeconds: i.standard_content_seconds,
      standardProductionSeconds: i.standard_production_seconds,
      isEffortAnchor: i.is_effort_anchor,
      completedAt: i.completed_at || undefined,
      publishedAt: i.published_at || undefined,
      finalInternalDeadline: i.final_internal_deadline || undefined,
      calculatedInternalDeadline: i.calculated_internal_deadline || undefined,
    }));

    const mappedSessions: WorkSession[] = (batch?.sessions || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      projectId: s.project_id,
      contentItemId: s.content_item_id || undefined,
      userId: s.user_id,
      startedAt: typeof s.started_at === "string" ? s.started_at : new Date(s.started_at).toISOString(),
      endedAt: s.ended_at ? (typeof s.ended_at === "string" ? s.ended_at : new Date(s.ended_at).toISOString()) : undefined,
      accumulatedSeconds: s.accumulated_seconds,
      status: s.status as any,
      adjustments: [],
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const mappedCommitments: ProjectCommitment[] = (batch?.commitments || []).map((c: any) => ({
      id: c.id,
      orgId: c.org_id,
      projectId: c.project_id,
      workTypeId: c.work_type_id || undefined,
      workTypeName: c.work_type_name,
      committedQuantity: c.committed_quantity,
      effectiveMonth: c.effective_month,
      createdAt: typeof c.created_at === "string" ? c.created_at : new Date(c.created_at).toISOString(),
      updatedAt: typeof c.updated_at === "string" ? c.updated_at : new Date(c.updated_at).toISOString(),
    }));

    const mappedPerfInputs: ProjectPerformanceInput[] = (batch?.perf_inputs || []).map((p: any) => ({
      id: p.id,
      orgId: p.org_id,
      projectId: p.project_id,
      campaignId: p.campaign_id || undefined,
      effectiveMonth: p.effective_month,
      currency: p.currency,
      adBudget: Number(p.ad_budget),
      adSpend: Number(p.ad_spend),
      leads: p.leads,
      conversions: p.conversions,
      createdAt: typeof p.created_at === "string" ? p.created_at : new Date(p.created_at).toISOString(),
      updatedAt: typeof p.updated_at === "string" ? p.updated_at : new Date(p.updated_at).toISOString(),
    }));

    const projectScorecards = mappedProjects.map((p) =>
      calculateProjectPerformance(p, period, mappedItems, mappedSessions, mappedCommitments, mappedPerfInputs)
    );

    return { success: true, projectScorecards, period };
  } catch (error: any) {
    return { success: false, projectScorecards: [], error: error.message };
  }
}

// 5. Effort Standards vs Actual Analysis Action (Bounded Single CTE Query)
export async function getAuthoritativeEffortAnalysisAction(
  filter: PeriodFilter = "this_month",
  customStart?: string,
  customEnd?: string
): Promise<{
  success: boolean;
  analysisRows: EffortAnalysisRow[];
  period?: any;
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, analysisRows: [], error: "Unauthorized" };
    if (authUser.organizationRole === "client") return { success: false, analysisRows: [], error: "Forbidden" };

    const period = getPeriodDateRange(filter, customStart, customEnd);
    const startTimestamp = `${period.startDate}T00:00:00.000Z`;
    const endTimestamp = `${period.endDate}T23:59:59.999Z`;

    const queryRes: any = await db.execute(sql`
      WITH
        scoped_standards AS (
          SELECT id, org_id, work_type, category, default_role,
                 content_seconds, production_seconds, total_seconds,
                 lead_time_workdays, active, version, effective_from, created_at, updated_at
          FROM effort_standards
          WHERE org_id = ${authUser.orgId} AND active = true
        ),
        scoped_items AS (
          SELECT id, project_id, content_group_id, title, platform, content_type, work_type, work_type_id,
                 stage, submission_deadline, scheduled_publication_date, final_planned_seconds,
                 standard_content_seconds, standard_production_seconds, is_effort_anchor,
                 completed_at, published_at, final_internal_deadline, calculated_internal_deadline
          FROM content_items
          WHERE org_id = ${authUser.orgId}
            AND (completed_at IS NOT NULL OR stage IN ('published', 'approved'))
            AND (
              (completed_at >= ${startTimestamp}::timestamptz AND completed_at <= ${endTimestamp}::timestamptz) OR
              (published_at >= ${startTimestamp}::timestamptz AND published_at <= ${endTimestamp}::timestamptz)
            )
            AND deleted_at IS NULL
        ),
        scoped_sessions AS (
          SELECT id, org_id, project_id, content_item_id, user_id, started_at, ended_at,
                 accumulated_seconds, status, created_at, updated_at
          FROM work_sessions
          WHERE org_id = ${authUser.orgId}
            AND content_item_id IN (SELECT id FROM scoped_items)
        )
      SELECT
        (SELECT COALESCE(json_agg(st), '[]'::json) FROM scoped_standards st) AS standards,
        (SELECT COALESCE(json_agg(i), '[]'::json) FROM scoped_items i) AS items,
        (SELECT COALESCE(json_agg(s), '[]'::json) FROM scoped_sessions s) AS sessions;
    `);
    const batch: any = queryRes.rows?.[0] || queryRes?.[0] || {};

    const mappedStandards: EffortStandard[] = (batch?.standards || []).map((std: any) => ({
      id: std.id,
      orgId: std.org_id,
      category: std.category,
      workType: std.work_type,
      contentSeconds: std.content_seconds,
      productionSeconds: std.production_seconds,
      totalSeconds: std.total_seconds,
      leadTimeWorkdays: std.lead_time_workdays,
      defaultRole: std.default_role,
      active: std.active,
      version: std.version,
      effectiveFrom: typeof std.effective_from === "string" ? std.effective_from : new Date(std.effective_from).toISOString(),
      createdAt: typeof std.created_at === "string" ? std.created_at : new Date(std.created_at).toISOString(),
      updatedAt: typeof std.updated_at === "string" ? std.updated_at : new Date(std.updated_at).toISOString(),
    }));

    const mappedItems: ContentItem[] = (batch?.items || []).map((i: any) => ({
      id: i.id,
      projectId: i.project_id,
      campaignId: i.campaign_id || undefined,
      contentGroupId: i.content_group_id || undefined,
      title: i.title,
      platform: i.platform as any,
      contentType: i.content_type as any,
      workType: i.work_type || undefined,
      workTypeId: i.work_type_id || undefined,
      stage: i.stage as any,
      deadlines: {
        submissionDeadline: i.submission_deadline || undefined,
        scheduledPublicationDate: i.scheduled_publication_date || undefined,
      },
      finalPlannedSeconds: i.final_planned_seconds,
      standardContentSeconds: i.standard_content_seconds,
      standardProductionSeconds: i.standard_production_seconds,
      isEffortAnchor: i.is_effort_anchor,
      completedAt: i.completed_at || undefined,
      publishedAt: i.published_at || undefined,
      finalInternalDeadline: i.final_internal_deadline || undefined,
      calculatedInternalDeadline: i.calculated_internal_deadline || undefined,
    }));

    const mappedSessions: WorkSession[] = (batch?.sessions || []).map((s: any) => ({
      id: s.id,
      orgId: s.org_id,
      projectId: s.project_id,
      contentItemId: s.content_item_id || undefined,
      userId: s.user_id,
      startedAt: typeof s.started_at === "string" ? s.started_at : new Date(s.started_at).toISOString(),
      endedAt: s.ended_at ? (typeof s.ended_at === "string" ? s.ended_at : new Date(s.ended_at).toISOString()) : undefined,
      accumulatedSeconds: s.accumulated_seconds,
      status: s.status as any,
      adjustments: [],
      createdAt: typeof s.created_at === "string" ? s.created_at : new Date(s.created_at).toISOString(),
      updatedAt: typeof s.updated_at === "string" ? s.updated_at : new Date(s.updated_at).toISOString(),
    }));

    const analysisRows = calculateEffortAnalysis(mappedStandards, mappedItems, mappedSessions);

    return { success: true, analysisRows, period };
  } catch (error: any) {
    return { success: false, analysisRows: [], error: error.message };
  }
}

// 6. Main Live Dashboard Action (Management & Employee View)
export interface MainDashboardDataDTO {
  isManagement: boolean;
  tasksDueTodayCount: number;
  overdueOpenTasksCount: number;
  adHocHoursThisMonth: number;
  completedThisMonthCount: number;
  todaysWorkload: {
    id: string;
    projectId: string;
    projectName: string;
    topic: string;
    title: string;
    workType: string;
    internalDeadline: string;
    postingDate: string;
    assigneeName: string;
    plannedHours: number | null;
    status: string;
    priority: string;
    timing?: "overdue" | "today";
    isEffortAnchor?: boolean;
  }[];
  weeklyTeamCapacity: EmployeePeriodScorecard[];
  monthlyProjectHealth: ProjectPerformanceScorecard[];
  employeePersonalView?: {
    overdueTasks: ContentItem[];
    dueTodayTasks: ContentItem[];
    plannedHoursToday: number;
    loggedHoursToday: number;
    urgentTasks: ContentItem[];
    activeTimer?: WorkSession;
    queueToday: ContentItem[];
    queueTomorrow: ContentItem[];
    queueUpcoming: ContentItem[];
    weekScorecard: EmployeePeriodScorecard;
  };
}

export async function getAuthoritativeMainDashboardAction(actorUserId?: string): Promise<{
  success: boolean;
  data?: MainDashboardDataDTO;
  error?: string;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeMainDashboardAction");
  try {
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) return { success: false, error: "Unauthorized" };
    profiler.mark("auth-resolution");

    const orgId = authUser.orgId;
    const isManagement =
      authUser.organizationRole === "founder" ||
      authUser.organizationRole === "admin" ||
      authUser.organizationRole === "consultant";

    const istFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayISTStr = istFormatter.format(new Date()); // e.g. "2026-09-04"
    const startOfTodayIST = new Date(`${todayISTStr}T00:00:00+05:30`);
    const startOfTomorrowIST = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);
    const endOfTomorrowIST = new Date(startOfTomorrowIST.getTime() + 24 * 60 * 60 * 1000);

    const thisMonthPeriod = getPeriodDateRange("this_month");
    const thisWeekPeriod = getPeriodDateRange("this_week");
    const startOfMonthIST = new Date(`${thisMonthPeriod.startDate}T00:00:00+05:30`);
    const startOfNextMonthIST = new Date(new Date(`${thisMonthPeriod.endDate}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);
    const startOfWeekIST = new Date(`${thisWeekPeriod.startDate}T00:00:00+05:30`);
    const startOfNextWeekIST = new Date(new Date(`${thisWeekPeriod.endDate}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);

    // Execute 4 bounded queries in parallel (1 multiplexed roundtrip)
    const [topCardsRes, workloadRes, capacityRes, projectHealthRes] = await Promise.all([
      // 1. Top Cards Aggregate Query
      db.execute(sql`
        SELECT
          COUNT(DISTINCT ci.id) FILTER (
            WHERE (ci.deleted_at IS NULL)
            AND (p.deleted_at IS NULL)
            AND (p.archived_at IS NULL)
            AND (ci.status != 'archived')
            AND (ci.stage != 'published' AND ci.completed_at IS NULL)
            AND (COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) >= ${startOfTodayIST.toISOString()}::timestamptz
                 AND COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) < ${startOfTomorrowIST.toISOString()}::timestamptz)
            AND (ci.content_group_id IS NULL OR ci.is_effort_anchor = true OR COALESCE(ci.final_planned_seconds, 0) > 0)
          )::int AS tasks_due_today,

          COUNT(DISTINCT ci.id) FILTER (
            WHERE (ci.deleted_at IS NULL)
            AND (p.deleted_at IS NULL)
            AND (p.archived_at IS NULL)
            AND (ci.status != 'archived')
            AND (ci.stage != 'published' AND ci.completed_at IS NULL)
            AND (COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) < ${startOfTodayIST.toISOString()}::timestamptz)
            AND (ci.content_group_id IS NULL OR ci.is_effort_anchor = true OR COALESCE(ci.final_planned_seconds, 0) > 0)
          )::int AS overdue_tasks,

          COUNT(DISTINCT ci.id) FILTER (
            WHERE (ci.deleted_at IS NULL)
            AND (p.deleted_at IS NULL)
            AND (p.archived_at IS NULL)
            AND (ci.stage = 'published' OR ci.completed_at IS NOT NULL)
            AND (COALESCE(ci.completed_at, ci.published_at) >= ${startOfMonthIST.toISOString()}::timestamptz
                 AND COALESCE(ci.completed_at, ci.published_at) < ${startOfNextMonthIST.toISOString()}::timestamptz)
          )::int AS completed_this_month,

          COALESCE(SUM(ci.final_planned_seconds) FILTER (
            WHERE (ci.deleted_at IS NULL)
            AND (p.deleted_at IS NULL)
            AND (p.archived_at IS NULL)
            AND (ci.work_nature = 'ad_hoc')
            AND (COALESCE(ci.scheduled_publication_date, ci.final_internal_deadline, ci.completed_at) >= ${startOfMonthIST.toISOString()}::timestamptz
                 AND COALESCE(ci.scheduled_publication_date, ci.final_internal_deadline, ci.completed_at) < ${startOfNextMonthIST.toISOString()}::timestamptz)
          ), 0)::int AS ad_hoc_planned_seconds
        FROM content_items ci
        JOIN projects p ON ci.project_id = p.id
        WHERE ci.org_id = ${orgId}
      `),

      // 2. Today's Workload Rows Query (joins project, assignment, user in PostgreSQL)
      db.execute(sql`
        SELECT 
          ci.id,
          ci.project_id AS "projectId",
          p.name AS "projectName",
          COALESCE(ci.topic, ci.title) AS "topic",
          ci.title,
          COALESCE(ci.work_type, ci.content_type) AS "workType",
          COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) AS "internalDeadline",
          ci.scheduled_publication_date AS "postingDate",
          COALESCE(u.full_name, 'Unassigned') AS "assigneeName",
          CASE 
            WHEN ci.final_planned_seconds IS NOT NULL THEN ROUND((ci.final_planned_seconds::numeric / 3600.0), 2)
            ELSE NULL
          END AS "plannedHours",
          ci.stage AS "status",
          ci.priority,
          CASE 
            WHEN COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) < ${startOfTodayIST.toISOString()}::timestamptz THEN 'overdue'
            ELSE 'today'
          END AS "timing",
          ci.is_effort_anchor AS "isEffortAnchor"
        FROM content_items ci
        JOIN projects p ON ci.project_id = p.id
        LEFT JOIN content_assignments ca ON ca.content_item_id = ci.id AND ca.status IN ('assigned', 'accepted', 'in_progress')
        LEFT JOIN users u ON u.id = ca.assignee_user_id
        WHERE ci.org_id = ${orgId}
          AND ci.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND p.archived_at IS NULL
          AND ci.status != 'archived'
          AND ci.stage != 'published'
          AND ci.completed_at IS NULL
          AND (ca.status IS NULL OR ca.status IN ('assigned', 'accepted', 'in_progress'))
          AND COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) < ${startOfTomorrowIST.toISOString()}::timestamptz
          AND (ci.content_group_id IS NULL OR ci.is_effort_anchor = true OR COALESCE(ci.final_planned_seconds, 0) > 0)
        ORDER BY 
          CASE WHEN COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) < ${startOfTodayIST.toISOString()}::timestamptz THEN 0 ELSE 1 END,
          ci.priority = 'urgent' DESC,
          COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) ASC
      `),

      // 3. User Capacity & Workload Aggregation (Set-based in PostgreSQL)
      db.execute(sql`
        WITH user_planned AS (
          SELECT 
            ca.assignee_user_id AS user_id,
            COALESCE(SUM(ci.final_planned_seconds), 0)::numeric / 3600.0 AS assigned_hours,
            COUNT(*) FILTER (WHERE ci.stage = 'published' OR ci.completed_at IS NOT NULL)::int AS completed_count,
            COUNT(*) FILTER (
              WHERE (ci.stage = 'published' OR ci.completed_at IS NOT NULL)
              AND ci.completed_at <= COALESCE(ca.current_due_at, ca.initial_due_at, ci.final_internal_deadline, ci.submission_deadline)
            )::int AS on_time_count
          FROM content_assignments ca
          JOIN content_items ci ON ca.content_item_id = ci.id
          WHERE ca.org_id = ${orgId}
            AND ca.status IN ('assigned', 'accepted', 'in_progress', 'submitted', 'completed')
            AND ci.deleted_at IS NULL
            AND COALESCE(ca.current_due_at, ca.initial_due_at, ci.final_internal_deadline, ci.submission_deadline) >= ${startOfWeekIST.toISOString()}::timestamptz
            AND COALESCE(ca.current_due_at, ca.initial_due_at, ci.final_internal_deadline, ci.submission_deadline) < ${startOfNextWeekIST.toISOString()}::timestamptz
          GROUP BY ca.assignee_user_id
        ),
        user_actuals AS (
          SELECT 
            ws.user_id,
            COALESCE(SUM(ws.accumulated_seconds), 0)::numeric / 3600.0 AS actual_hours
          FROM work_sessions ws
          WHERE ws.org_id = ${orgId}
            AND ws.started_at >= ${startOfWeekIST.toISOString()}::timestamptz
            AND ws.started_at < ${startOfNextWeekIST.toISOString()}::timestamptz
          GROUP BY ws.user_id
        )
        SELECT 
          u.id,
          u.full_name AS name,
          u.organization_role AS role,
          u.email,
          u.avatar_url AS avatar,
          ROUND(COALESCE(up.assigned_hours, 0), 2) AS "assignedPlannedHours",
          ROUND(COALESCE(ua.actual_hours, 0), 2) AS "actualLoggedHours",
          COALESCE(up.completed_count, 0) AS "completedTasksCount",
          COALESCE(up.on_time_count, 0) AS "onTimeDeliveredCount"
        FROM users u
        LEFT JOIN user_planned up ON up.user_id = u.id
        LEFT JOIN user_actuals ua ON ua.user_id = u.id
        WHERE u.org_id = ${orgId}
          AND u.status = 'active'
          AND u.organization_role != 'client'
        ORDER BY u.full_name ASC
      `),

      // 4. Project Health Aggregation (Set-based in PostgreSQL)
      db.execute(sql`
        WITH proj_items AS (
          SELECT 
            ci.project_id,
            COUNT(*)::int AS planned_tasks_count,
            COUNT(*) FILTER (WHERE ci.stage = 'published' OR ci.completed_at IS NOT NULL)::int AS completed_tasks_count,
            COUNT(*) FILTER (
              WHERE (ci.stage != 'published' AND ci.completed_at IS NULL)
              AND COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) < NOW()
            )::int AS overdue_tasks_count,
            COALESCE(SUM(ci.final_planned_seconds), 0)::numeric / 3600.0 AS planned_hours
          FROM content_items ci
          WHERE ci.org_id = ${orgId}
            AND ci.deleted_at IS NULL
            AND COALESCE(ci.scheduled_publication_date, ci.final_internal_deadline, ci.submission_deadline, ci.completed_at) >= ${startOfMonthIST.toISOString()}::timestamptz
            AND COALESCE(ci.scheduled_publication_date, ci.final_internal_deadline, ci.submission_deadline, ci.completed_at) < ${startOfNextMonthIST.toISOString()}::timestamptz
          GROUP BY ci.project_id
        ),
        proj_actuals AS (
          SELECT 
            ws.project_id,
            COALESCE(SUM(ws.accumulated_seconds), 0)::numeric / 3600.0 AS actual_hours
          FROM work_sessions ws
          WHERE ws.org_id = ${orgId}
            AND ws.started_at >= ${startOfMonthIST.toISOString()}::timestamptz
            AND ws.started_at < ${startOfNextMonthIST.toISOString()}::timestamptz
          GROUP BY ws.project_id
        )
        SELECT 
          p.id,
          p.name,
          p.client_name AS "clientBrand",
          COALESCE(pi.planned_tasks_count, 0) AS "plannedTasksCount",
          COALESCE(pi.completed_tasks_count, 0) AS "completedTasksCount",
          COALESCE(pi.overdue_tasks_count, 0) AS "overdueTasksCount",
          ROUND(COALESCE(pi.planned_hours, 0), 2) AS "plannedHours",
          ROUND(COALESCE(pa.actual_hours, 0), 2) AS "actualHours"
        FROM projects p
        LEFT JOIN proj_items pi ON pi.project_id = p.id
        LEFT JOIN proj_actuals pa ON pa.project_id = p.id
        WHERE p.org_id = ${orgId}
          AND p.deleted_at IS NULL
          AND p.archived_at IS NULL
          AND p.status = 'active'
        ORDER BY p.name ASC
      `),
    ]);

    const topCardRow: any = topCardsRes.rows[0] || {};
    const workloadRows: any[] = workloadRes.rows || [];
    const userCapacityRows: any[] = capacityRes.rows || [];
    const projectHealthRows: any[] = projectHealthRes.rows || [];

    profiler.mark(
      "bounded-queries",
      1 + workloadRows.length + userCapacityRows.length + projectHealthRows.length
    );

    // Format Weekly Team Capacity Scorecards
    const weeklyTeamCapacity: EmployeePeriodScorecard[] = userCapacityRows.map((row) => {
      const baseCapacity = 40;
      const finalCapacity = 40;
      const assigned = parseFloat(row.assignedPlannedHours) || 0;
      const actual = parseFloat(row.actualLoggedHours) || 0;
      const remaining = Math.round((finalCapacity - assigned) * 100) / 100;
      const allocation = finalCapacity > 0 ? Math.round((assigned / finalCapacity) * 100) : 0;
      const utilization = finalCapacity > 0 ? Math.round((actual / finalCapacity) * 100) : 0;
      const efficiency = actual > 0 ? Math.round((assigned / actual) * 100) : null;
      const onTime =
        row.completedTasksCount > 0
          ? Math.round((row.onTimeDeliveredCount / row.completedTasksCount) * 100)
          : null;

      let capacityStatus: "Available" | "Healthy" | "Fully Loaded" | "Overloaded" = "Available";
      if (assigned > finalCapacity * 1.05) capacityStatus = "Overloaded";
      else if (assigned >= finalCapacity * 0.95) capacityStatus = "Fully Loaded";
      else if (assigned >= finalCapacity * 0.7) capacityStatus = "Healthy";

      return {
        user: {
          id: row.id,
          name: row.name,
          role: row.role,
          email: row.email,
          avatar: row.avatar || undefined,
        } as any,
        capacity: {
          userId: row.id,
          primaryFunction: "creative" as any,
          creativeEligibility: "primary" as any,
          baseCapacityHours: baseCapacity,
          adjustmentHours: 0,
          finalCapacityHours: finalCapacity,
          status: "active",
          reason: undefined,
          scheduleDetails: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
        },
        assignedPlannedHours: assigned,
        actualLoggedHours: actual,
        remainingPlannedHours: remaining,
        allocationPercent: allocation,
        utilizationPercent: utilization,
        efficiencyPercent: efficiency,
        efficiencyDetails: {
          totalCompletedPlannedHours: 0,
          totalCompletedActualHours: 0,
          varianceHours: 0,
        },
        capacityStatus,
        overtimeHours: actual > finalCapacity ? Math.round((actual - finalCapacity) * 100) / 100 : 0,
        completedTasksCount: row.completedTasksCount,
        onTimeDeliveredCount: row.onTimeDeliveredCount,
        onTimePercent: onTime,
        reworkIncidencePercent: null,
        firstPassApprovalPercent: null,
        revisionRoundsAvg: null,
        adHocHours: 0,
        goodwillHours: 0,
        assignedTasks: [],
        completedTasks: [],
        workSessions: [],
      };
    });

    // Format Monthly Project Health Scorecards
    const monthlyProjectHealth: ProjectPerformanceScorecard[] = projectHealthRows.map((row) => {
      const plannedTasks = row.plannedTasksCount || 0;
      const completedTasks = row.completedTasksCount || 0;
      const overdueTasks = row.overdueTasksCount || 0;
      const plannedHours = parseFloat(row.plannedHours) || 0;
      const actualHours = parseFloat(row.actualHours) || 0;
      const completionPercent =
        plannedTasks > 0 ? Math.round((completedTasks / plannedTasks) * 100) : 0;

      return {
        project: {
          id: row.id,
          name: row.name,
          clientBrand: row.clientBrand,
          status: "active",
        } as any,
        plannedTasksCount: plannedTasks,
        completedTasksCount: completedTasks,
        pendingTasksCount: Math.max(0, plannedTasks - completedTasks),
        overdueTasksCount: overdueTasks,
        plannedHours,
        actualHours,
        varianceHours: Math.round((plannedHours - actualHours) * 100) / 100,
        adHocHours: 0,
        goodwillHours: 0,
        completionPercent,
        commitments: [],
      };
    });

    // Format Today's Workload rows
    const todaysWorkload = workloadRows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      topic: row.topic,
      title: row.title,
      workType: row.workType,
      internalDeadline: row.internalDeadline ? new Date(row.internalDeadline).toISOString() : "Today",
      postingDate: row.postingDate ? new Date(row.postingDate).toISOString() : "TBD",
      assigneeName: row.assigneeName,
      plannedHours: row.plannedHours !== null ? parseFloat(row.plannedHours) : null,
      status: row.status,
      priority: row.priority || "normal",
      timing: row.timing as "overdue" | "today",
      isEffortAnchor: row.isEffortAnchor ?? true,
    }));

    // 5. Lightweight Employee Personal View (if employee)
    let employeePersonalView: MainDashboardDataDTO["employeePersonalView"] = undefined;
    if (!isManagement) {
      const [userItemsRes, activeTimerRes, userTodayHoursRes] = await Promise.all([
        db.execute(sql`
          SELECT 
            ci.id, ci.title, ci.project_id, ci.stage, ci.priority, ci.final_planned_seconds,
            ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline
          FROM content_items ci
          JOIN content_assignments ca ON ca.content_item_id = ci.id
          JOIN projects p ON p.id = ci.project_id
          JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = ca.assignee_user_id AND pm.status = 'active'
          WHERE ca.assignee_user_id = ${authUser.id}
            AND ci.org_id = ${orgId}
            AND ci.deleted_at IS NULL
            AND p.deleted_at IS NULL
            AND p.archived_at IS NULL
            AND (ci.status != 'archived')
            AND (ci.stage != 'published' AND ci.completed_at IS NULL)
            AND ca.status IN ('assigned', 'accepted', 'in_progress')
          ORDER BY ci.priority = 'urgent' DESC, ci.created_at ASC
        `),
        db.execute(sql`
          SELECT * FROM work_sessions
          WHERE user_id = ${authUser.id} AND status = 'active'
          LIMIT 1
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(accumulated_seconds), 0)::numeric / 3600.0 as logged_today
          FROM work_sessions
          WHERE user_id = ${authUser.id}
            AND started_at >= ${startOfTodayIST.toISOString()}::timestamptz
            AND started_at < ${startOfTomorrowIST.toISOString()}::timestamptz
        `),
      ]);

      const userItems = (userItemsRes.rows as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        projectId: r.project_id,
        stage: r.stage,
        priority: r.priority,
        finalPlannedSeconds: r.final_planned_seconds,
        finalInternalDeadline: r.final_internal_deadline,
        calculatedInternalDeadline: r.calculated_internal_deadline,
        deadlines: { submissionDeadline: r.submission_deadline },
      })) as any[];

      const overdueTasks = userItems.filter((i) => {
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        if (!dl) return false;
        const d = new Date(dl);
        return d < startOfTodayIST;
      });

      const dueTodayTasks = userItems.filter((i) => {
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        if (!dl) return false;
        const d = new Date(dl);
        return d >= startOfTodayIST && d < startOfTomorrowIST;
      });

      const queueTomorrow = userItems.filter((i) => {
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        if (!dl) return false;
        const d = new Date(dl);
        return d >= startOfTomorrowIST && d < endOfTomorrowIST;
      });

      const queueUpcoming = userItems.filter((i) => {
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        if (!dl) return false;
        const d = new Date(dl);
        return d >= endOfTomorrowIST;
      });

      const loggedToday = parseFloat((userTodayHoursRes.rows[0] as any)?.logged_today || "0");
      const plannedToday = [...overdueTasks, ...dueTodayTasks].reduce(
        (sum, i) => sum + (i.finalPlannedSeconds ? i.finalPlannedSeconds / 3600 : 0),
        0
      );

      const currentUserScorecard =
        weeklyTeamCapacity.find((c) => c.user.id === authUser.id) ||
        ({
          user: { id: authUser.id, name: authUser.fullName, role: authUser.organizationRole, email: authUser.email } as any,
          capacity: {
            userId: authUser.id,
            primaryFunction: "creative" as any,
            creativeEligibility: "primary" as any,
            baseCapacityHours: 40,
            adjustmentHours: 0,
            finalCapacityHours: 40,
            status: "active",
            scheduleDetails: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
          },
          assignedPlannedHours: 0,
          actualLoggedHours: loggedToday,
          remainingPlannedHours: 40,
          allocationPercent: 0,
          utilizationPercent: 0,
          efficiencyPercent: null,
          efficiencyDetails: {
            totalCompletedPlannedHours: 0,
            totalCompletedActualHours: 0,
            varianceHours: 0,
          },
          capacityStatus: "Available",
          overtimeHours: 0,
          completedTasksCount: 0,
          onTimeDeliveredCount: 0,
          onTimePercent: null,
          reworkIncidencePercent: null,
          firstPassApprovalPercent: null,
          revisionRoundsAvg: null,
          adHocHours: 0,
          goodwillHours: 0,
          assignedTasks: [],
          completedTasks: [],
          workSessions: [],
        } as EmployeePeriodScorecard);

      employeePersonalView = {
        overdueTasks,
        dueTodayTasks,
        plannedHoursToday: Math.round(plannedToday * 100) / 100,
        loggedHoursToday: Math.round(loggedToday * 100) / 100,
        urgentTasks: userItems.filter((i) => i.priority === "urgent"),
        activeTimer: (activeTimerRes.rows[0] as any) || undefined,
        queueToday: dueTodayTasks,
        queueTomorrow,
        queueUpcoming,
        weekScorecard: currentUserScorecard,
      };
    }

    profiler.mark("dto-mapping");
    profiler.logSummary();

    return {
      success: true,
      data: {
        isManagement,
        tasksDueTodayCount: topCardRow.tasks_due_today || 0,
        overdueOpenTasksCount: topCardRow.overdue_tasks || 0,
        adHocHoursThisMonth: Math.round(((topCardRow.ad_hoc_planned_seconds || 0) / 3600) * 100) / 100,
        completedThisMonthCount: topCardRow.completed_this_month || 0,
        todaysWorkload,
        weeklyTeamCapacity,
        monthlyProjectHealth,
        employeePersonalView,
      },
    };
  } catch (error: any) {
    console.error("[getAuthoritativeMainDashboardAction] error:", error);
    return { success: false, error: error.message };
  }
}
