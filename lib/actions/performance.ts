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

// Helper to hydrate PostgreSQL rows into strictly typed domain models with bounded performance filters
async function fetchAuthoritativeWorkspaceEntities(orgId: string, options?: { fromDate?: string }) {
  const fromDate = options?.fromDate;
  const sessionCondition = fromDate
    ? sql`${workSessions.orgId} = ${orgId} AND (${workSessions.status} = 'active' OR ${workSessions.startedAt} >= ${fromDate})`
    : eq(workSessions.orgId, orgId);

  const [
    userRows,
    projectRows,
    itemRows,
    assignmentRows,
    sessionRows,
    crRows,
    scheduleRows,
    adjustmentRows,
    standardRows,
    commitmentRows,
    perfInputRows,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.orgId, orgId)),
    db.select().from(projects).where(eq(projects.orgId, orgId)),
    db.select().from(contentItems).where(and(eq(contentItems.orgId, orgId), sql`${contentItems.deletedAt} IS NULL`)),
    db.select().from(contentAssignments).where(eq(contentAssignments.orgId, orgId)),
    db.select().from(workSessions).where(sessionCondition),
    db.select().from(changeRequests).where(eq(changeRequests.orgId, orgId)),
    db.select().from(employeeCapacitySchedules).where(eq(employeeCapacitySchedules.orgId, orgId)),
    db.select().from(capacityAdjustments).where(eq(capacityAdjustments.orgId, orgId)),
    db.select().from(effortStandards).where(and(eq(effortStandards.orgId, orgId), eq(effortStandards.active, true))),
    db.select().from(projectCommitments).where(eq(projectCommitments.orgId, orgId)),
    db.select().from(projectPerformanceInputs).where(eq(projectPerformanceInputs.orgId, orgId)),
  ]);

  const mappedUsers: User[] = userRows.map((u) => ({
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

  const mappedProjects: Project[] = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    clientBrand: p.clientName,
    avatar: "",
    scope: p.briefMarkdown || p.engagementModel || "",
    timezone: "Asia/Kolkata",
    status: p.status as any,
    targetRequirements: { posts: 0, carousels: 0, reels: 0, trialReels: 0 },
    workflowStages: ["idea", "draft", "in_review", "approved", "published"],
    createdAt: p.createdAt.toISOString(),
  }));

  const mappedItems: ContentItem[] = itemRows.map((i) => ({
    id: i.id,
    projectId: i.projectId,
    campaignId: i.campaignId || undefined,
    contentGroupId: i.contentGroupId || undefined,
    title: i.title,
    platform: i.platform as any,
    contentType: i.contentType as any,
    workType: i.workType || undefined,
    workTypeId: i.workTypeId || undefined,
    contentPillar: i.contentPillar || undefined,
    topic: i.topic || undefined,
    brief: i.brief || undefined,
    referenceLink: i.referenceLink || undefined,
    priority: (i.priority || "normal") as any,
    workNature: (i.workNature || "planned") as any,
    accountOwnerId: i.accountOwnerId || undefined,
    stage: i.stage as any,
    accountableOwnerId: "",
    collaboratorIds: [],
    deadlines: {
      submissionDeadline: i.submissionDeadline ? i.submissionDeadline.toISOString() : undefined,
      resubmissionDeadline: i.resubmissionDeadline ? i.resubmissionDeadline.toISOString() : undefined,
      approvalTarget: i.approvalTarget ? i.approvalTarget.toISOString() : undefined,
      scheduledPublicationDate: i.scheduledPublicationDate ? i.scheduledPublicationDate.toISOString() : undefined,
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
    currentVersionNumber: i.currentVersionNumber,
    publishedAt: i.publishedAt ? i.publishedAt.toISOString() : undefined,
    liveUrl: i.liveUrl || undefined,
    publishedByUserId: i.publishedByUserId || undefined,
    clientVisible: i.clientVisible,
    scopeClassification: i.scopeClassification as any,
  }));

  const mappedAssignments: ContentAssignment[] = assignmentRows.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    contentItemId: a.contentItemId,
    assigneeUserId: a.assigneeUserId,
    assignmentRole: a.assignmentRole as any,
    status: a.status as any,
    assignedByUserId: a.assignedByUserId,
    assignedAt: a.assignedAt.toISOString(),
    initialDueAt: a.initialDueAt.toISOString(),
    currentDueAt: a.currentDueAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  const mappedSessions: WorkSession[] = sessionRows.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    contentItemId: s.contentItemId,
    assignmentId: s.assignmentId,
    userId: s.userId,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : undefined,
    accumulatedSeconds: s.accumulatedSeconds,
    status: s.status as any,
    adjustments: [],
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  const mappedCRs: ChangeRequest[] = crRows.map((cr) => ({
    id: cr.id,
    projectId: cr.projectId,
    contentItemId: cr.contentItemId,
    submissionVersionId: cr.submissionVersionId,
    component: cr.component as any,
    reviewerUserId: cr.reviewerUserId,
    reviewerName: "",
    requestedChange: cr.requestedChange,
    priority: cr.priority as any,
    status: cr.status as any,
    createdAt: cr.createdAt.toISOString(),
  }));

  const mappedSchedules: EmployeeCapacitySchedule[] = scheduleRows.map((s) => ({
    id: s.id,
    orgId: s.orgId,
    userId: s.userId,
    effectiveFrom: s.effectiveFrom,
    effectiveTo: s.effectiveTo,
    mondayHours: Number(s.mondayHours),
    tuesdayHours: Number(s.tuesdayHours),
    wednesdayHours: Number(s.wednesdayHours),
    thursdayHours: Number(s.thursdayHours),
    fridayHours: Number(s.fridayHours),
    saturdayHours: Number(s.saturdayHours),
    sundayHours: Number(s.sundayHours),
    primaryFunction: s.primaryFunction,
    creativeEligibility: s.creativeEligibility as any,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  const mappedAdjustments: CapacityAdjustment[] = adjustmentRows.map((a) => ({
    id: a.id,
    orgId: a.orgId,
    userId: a.userId,
    adjustmentDate: a.adjustmentDate,
    kind: a.kind as any,
    adjustmentHours: Number(a.adjustmentHours),
    reason: a.reason,
    createdByUserId: a.createdByUserId || undefined,
    createdAt: a.createdAt.toISOString(),
  }));

  const mappedStandards: EffortStandard[] = standardRows.map((std) => ({
    id: std.id,
    orgId: std.orgId,
    category: std.category,
    workType: std.workType,
    contentSeconds: std.contentSeconds,
    productionSeconds: std.productionSeconds,
    totalSeconds: std.totalSeconds,
    leadTimeWorkdays: std.leadTimeWorkdays,
    defaultRole: std.defaultRole,
    active: std.active,
    version: std.version,
    effectiveFrom: std.effectiveFrom.toISOString(),
    createdAt: std.createdAt.toISOString(),
    updatedAt: std.updatedAt.toISOString(),
  }));

  const mappedCommitments: ProjectCommitment[] = commitmentRows.map((c) => ({
    id: c.id,
    orgId: c.orgId,
    projectId: c.projectId,
    workTypeId: c.workTypeId || undefined,
    workTypeName: c.workTypeName,
    committedQuantity: c.committedQuantity,
    effectiveMonth: c.effectiveMonth,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  const mappedPerfInputs: ProjectPerformanceInput[] = perfInputRows.map((p) => ({
    id: p.id,
    orgId: p.orgId,
    projectId: p.projectId,
    campaignId: p.campaignId || undefined,
    effectiveMonth: p.effectiveMonth,
    currency: p.currency,
    adBudget: Number(p.adBudget),
    adSpend: Number(p.adSpend),
    leads: p.leads,
    conversions: p.conversions,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return {
    users: mappedUsers,
    projects: mappedProjects,
    items: mappedItems,
    assignments: mappedAssignments,
    workSessions: mappedSessions,
    changeRequests: mappedCRs,
    schedules: mappedSchedules,
    adjustments: mappedAdjustments,
    standards: mappedStandards,
    commitments: mappedCommitments,
    perfInputs: mappedPerfInputs,
  };
}

// 1. Performance Overview Action
export async function getAuthoritativePerformanceOverviewAction(
  filter: PeriodFilter = "this_month",
  customStart?: string,
  customEnd?: string
): Promise<{
  success: boolean;
  overview?: TeamPerformanceOverviewDTO;
  projectScorecards?: ProjectPerformanceScorecard[];
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    if (authUser.organizationRole === "client") return { success: false, error: "Forbidden for client role" };

    const data = await fetchAuthoritativeWorkspaceEntities(authUser.orgId);
    const period = getPeriodDateRange(filter, customStart, customEnd);

    const overview = calculateTeamPerformanceOverview(
      data.users,
      period,
      data.items,
      data.assignments,
      data.workSessions,
      data.changeRequests,
      data.schedules,
      data.adjustments
    );

    const projectScorecards = data.projects.map((p) =>
      calculateProjectPerformance(p, period, data.items, data.workSessions, data.commitments, data.perfInputs)
    );

    return { success: true, overview, projectScorecards };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 2. Team Capacity Action
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

    const data = await fetchAuthoritativeWorkspaceEntities(authUser.orgId);
    const period = getPeriodDateRange(filter, customStart, customEnd);

    // Designers ONLY get their own team capacity scorecard
    const filteredUsers = authUser.organizationRole === "designer"
      ? data.users.filter((u) => u.id === authUser.id)
      : data.users.filter((u) => u.role !== "client" && u.status === "active");

    const scorecards = filteredUsers.map((u) =>
      calculateEmployeeScorecard(
        u,
        period,
        data.items,
        data.assignments,
        data.workSessions,
        data.changeRequests,
        data.schedules,
        data.adjustments
      )
    );

    return { success: true, scorecards, period };
  } catch (error: any) {
    return { success: false, scorecards: [], error: error.message };
  }
}

// 3. Employee Detailed Drilldown Action
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

    const data = await fetchAuthoritativeWorkspaceEntities(authUser.orgId);
    const targetUser = data.users.find((u) => u.id === userId);
    if (!targetUser) return { success: false, error: "User not found" };

    const period = getPeriodDateRange(filter, customStart, customEnd);
    const scorecard = calculateEmployeeScorecard(
      targetUser,
      period,
      data.items,
      data.assignments,
      data.workSessions,
      data.changeRequests,
      data.schedules,
      data.adjustments
    );

    return { success: true, scorecard };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 4. Projects Performance Action
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

    const data = await fetchAuthoritativeWorkspaceEntities(authUser.orgId);
    const period = getPeriodDateRange(filter, customStart, customEnd);

    const projectScorecards = data.projects.map((p) =>
      calculateProjectPerformance(p, period, data.items, data.workSessions, data.commitments, data.perfInputs)
    );

    return { success: true, projectScorecards, period };
  } catch (error: any) {
    return { success: false, projectScorecards: [], error: error.message };
  }
}

// 5. Effort Standards vs Actual Analysis Action
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

    const data = await fetchAuthoritativeWorkspaceEntities(authUser.orgId);
    const period = getPeriodDateRange(filter, customStart, customEnd);

    // Filter completed tasks in period
    const completedTasks = data.items.filter((i) => {
      const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
      if (!isDone) return false;
      const compDateStr = (i.completedAt || i.publishedAt || period.startDate).split("T")[0];
      return compDateStr >= period.startDate && compDateStr <= period.endDate;
    });

    const analysisRows = calculateEffortAnalysis(data.standards, completedTasks, data.workSessions);

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
  }[];
  weeklyTeamCapacity: EmployeePeriodScorecard[];
  monthlyProjectHealth: ProjectPerformanceScorecard[];
  employeePersonalView?: {
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

export async function getAuthoritativeMainDashboardAction(): Promise<{
  success: boolean;
  data?: MainDashboardDataDTO;
  error?: string;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeMainDashboardAction");
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };
    profiler.mark("auth-resolution");

    const orgId = authUser.orgId;
    const isManagement =
      authUser.organizationRole === "founder" ||
      authUser.organizationRole === "admin" ||
      authUser.organizationRole === "consultant";

    const todayStr = new Date().toISOString().split("T")[0];
    const thisMonthPeriod = getPeriodDateRange("this_month");
    const thisWeekPeriod = getPeriodDateRange("this_week");

    // Execute 4 bounded queries in parallel (1 multiplexed roundtrip)
    const [topCardsRes, workloadRes, capacityRes, projectHealthRes] = await Promise.all([
      // 1. Top Cards Aggregate Query
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (
            WHERE (deleted_at IS NULL)
            AND (stage NOT IN ('published', 'approved') AND completed_at IS NULL)
            AND (COALESCE(final_internal_deadline::text, calculated_internal_deadline::text, submission_deadline::text, '') LIKE ${todayStr + "%"})
          )::int AS tasks_due_today,

          COUNT(*) FILTER (
            WHERE (deleted_at IS NULL)
            AND (stage NOT IN ('published', 'approved') AND completed_at IS NULL)
            AND (COALESCE(final_internal_deadline, calculated_internal_deadline, submission_deadline) < NOW())
          )::int AS overdue_tasks,

          COUNT(*) FILTER (
            WHERE (deleted_at IS NULL)
            AND (stage IN ('published', 'approved') OR completed_at IS NOT NULL)
            AND (COALESCE(completed_at::text, published_at::text, '') >= ${thisMonthPeriod.startDate}
                 AND COALESCE(completed_at::text, published_at::text, '') <= ${thisMonthPeriod.endDate + "T23:59:59"})
          )::int AS completed_this_month,

          COALESCE(SUM(final_planned_seconds) FILTER (
            WHERE (deleted_at IS NULL)
            AND (work_nature = 'ad_hoc')
            AND (COALESCE(scheduled_publication_date::text, final_internal_deadline::text, completed_at::text, '') >= ${thisMonthPeriod.startDate}
                 AND COALESCE(scheduled_publication_date::text, final_internal_deadline::text, completed_at::text, '') <= ${thisMonthPeriod.endDate + "T23:59:59"})
          ), 0)::int AS ad_hoc_planned_seconds
        FROM content_items
        WHERE org_id = ${orgId}
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
          COALESCE(ci.final_internal_deadline::text, ci.calculated_internal_deadline::text, ci.submission_deadline::text, 'Today') AS "internalDeadline",
          COALESCE(ci.scheduled_publication_date::text, 'TBD') AS "postingDate",
          COALESCE(u.full_name, 'Unassigned') AS "assigneeName",
          CASE 
            WHEN ci.final_planned_seconds IS NOT NULL THEN ROUND((ci.final_planned_seconds::numeric / 3600.0), 2)
            ELSE NULL
          END AS "plannedHours",
          ci.stage AS "status",
          ci.priority
        FROM content_items ci
        JOIN projects p ON ci.project_id = p.id
        LEFT JOIN content_assignments ca ON ca.content_item_id = ci.id
        LEFT JOIN users u ON u.id = ca.assignee_user_id
        WHERE ci.org_id = ${orgId}
          AND ci.deleted_at IS NULL
          AND ci.stage NOT IN ('published', 'approved')
          AND ci.completed_at IS NULL
          AND COALESCE(ci.final_internal_deadline::text, ci.calculated_internal_deadline::text, ci.submission_deadline::text, '') LIKE ${todayStr + "%"}
        ORDER BY ci.priority = 'urgent' DESC, ci.created_at ASC
      `),

      // 3. User Capacity & Workload Aggregation (Set-based in PostgreSQL)
      db.execute(sql`
        WITH user_planned AS (
          SELECT 
            ca.assignee_user_id AS user_id,
            COALESCE(SUM(ci.final_planned_seconds), 0)::numeric / 3600.0 AS assigned_hours,
            COUNT(*) FILTER (WHERE ci.stage IN ('published', 'approved') OR ci.completed_at IS NOT NULL)::int AS completed_count,
            COUNT(*) FILTER (
              WHERE (ci.stage IN ('published', 'approved') OR ci.completed_at IS NOT NULL)
              AND ci.completed_at <= COALESCE(ca.current_due_at, ca.initial_due_at, ci.final_internal_deadline, ci.submission_deadline)
            )::int AS on_time_count
          FROM content_assignments ca
          JOIN content_items ci ON ca.content_item_id = ci.id
          WHERE ca.org_id = ${orgId}
            AND ca.status IN ('assigned', 'accepted', 'in_progress', 'submitted', 'completed')
            AND ci.deleted_at IS NULL
            AND COALESCE(ca.current_due_at::text, ca.initial_due_at::text, ci.final_internal_deadline::text, ci.submission_deadline::text, '') >= ${thisWeekPeriod.startDate}
            AND COALESCE(ca.current_due_at::text, ca.initial_due_at::text, ci.final_internal_deadline::text, ci.submission_deadline::text, '') <= ${thisWeekPeriod.endDate + "T23:59:59"}
          GROUP BY ca.assignee_user_id
        ),
        user_actuals AS (
          SELECT 
            ws.user_id,
            COALESCE(SUM(ws.accumulated_seconds), 0)::numeric / 3600.0 AS actual_hours
          FROM work_sessions ws
          WHERE ws.org_id = ${orgId}
            AND ws.started_at >= ${thisWeekPeriod.startDate}
            AND ws.started_at <= ${thisWeekPeriod.endDate + "T23:59:59"}
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
            COUNT(*) FILTER (WHERE ci.stage IN ('published', 'approved') OR ci.completed_at IS NOT NULL)::int AS completed_tasks_count,
            COUNT(*) FILTER (
              WHERE (ci.stage NOT IN ('published', 'approved') AND ci.completed_at IS NULL)
              AND COALESCE(ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline) < NOW()
            )::int AS overdue_tasks_count,
            COALESCE(SUM(ci.final_planned_seconds), 0)::numeric / 3600.0 AS planned_hours
          FROM content_items ci
          WHERE ci.org_id = ${orgId}
            AND ci.deleted_at IS NULL
            AND COALESCE(ci.scheduled_publication_date::text, ci.final_internal_deadline::text, ci.submission_deadline::text, ci.completed_at::text, '') >= ${thisMonthPeriod.startDate}
            AND COALESCE(ci.scheduled_publication_date::text, ci.final_internal_deadline::text, ci.submission_deadline::text, ci.completed_at::text, '') <= ${thisMonthPeriod.endDate + "T23:59:59"}
          GROUP BY ci.project_id
        ),
        proj_actuals AS (
          SELECT 
            ws.project_id,
            COALESCE(SUM(ws.accumulated_seconds), 0)::numeric / 3600.0 AS actual_hours
          FROM work_sessions ws
          WHERE ws.org_id = ${orgId}
            AND ws.started_at >= ${thisMonthPeriod.startDate}
            AND ws.started_at <= ${thisMonthPeriod.endDate + "T23:59:59"}
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
      internalDeadline: row.internalDeadline,
      postingDate: row.postingDate,
      assigneeName: row.assigneeName,
      plannedHours: row.plannedHours !== null ? parseFloat(row.plannedHours) : null,
      status: row.status,
      priority: row.priority || "normal",
    }));

    // 5. Lightweight Employee Personal View (if employee)
    let employeePersonalView: MainDashboardDataDTO["employeePersonalView"] = undefined;
    if (!isManagement) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      const [userItemsRes, activeTimerRes, userTodayHoursRes] = await Promise.all([
        db.execute(sql`
          SELECT 
            ci.id, ci.title, ci.project_id, ci.stage, ci.priority, ci.final_planned_seconds,
            ci.final_internal_deadline, ci.calculated_internal_deadline, ci.submission_deadline
          FROM content_items ci
          JOIN content_assignments ca ON ca.content_item_id = ci.id
          WHERE ca.assignee_user_id = ${authUser.id}
            AND ci.org_id = ${orgId}
            AND ci.deleted_at IS NULL
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
          WHERE user_id = ${authUser.id} AND started_at >= ${todayStr}
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

      const dueTodayTasks = userItems.filter((i) => {
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        return dl ? dl.toString().startsWith(todayStr) : false;
      });

      const queueTomorrow = userItems.filter((i) => {
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        return dl ? dl.toString().startsWith(tomorrowStr) : false;
      });

      const queueUpcoming = userItems.filter((i) => {
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        return dl ? dl.toString().split("T")[0] > tomorrowStr : false;
      });

      const loggedToday = parseFloat((userTodayHoursRes.rows[0] as any)?.logged_today || "0");
      const plannedToday = dueTodayTasks.reduce(
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
