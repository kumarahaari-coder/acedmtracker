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

// Helper to hydrate PostgreSQL rows into strictly typed domain models
async function fetchAuthoritativeWorkspaceEntities(orgId: string) {
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
    db.select().from(contentItems).where(eq(contentItems.orgId, orgId)),
    db.select().from(contentAssignments).where(eq(contentAssignments.orgId, orgId)),
    db.select().from(workSessions).where(eq(workSessions.orgId, orgId)),
    db.select().from(changeRequests).where(eq(changeRequests.orgId, orgId)),
    db.select().from(employeeCapacitySchedules).where(eq(employeeCapacitySchedules.orgId, orgId)),
    db.select().from(capacityAdjustments).where(eq(capacityAdjustments.orgId, orgId)),
    db.select().from(effortStandards).where(eq(effortStandards.orgId, orgId)),
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
    workType: i.workType,
    workTypeId: i.workTypeId || undefined,
    contentPillar: i.contentPillar || undefined,
    topic: i.topic || undefined,
    brief: i.brief || undefined,
    referenceLink: i.referenceLink || undefined,
    priority: i.priority as any,
    workNature: i.workNature as any,
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
    standardContentSeconds: i.standardContentSeconds,
    standardProductionSeconds: i.standardProductionSeconds,
    revisionContentSeconds: i.revisionContentSeconds,
    revisionProductionSeconds: i.revisionProductionSeconds,
    finalPlannedSeconds: i.finalPlannedSeconds,
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

    const scorecards = data.users
      .filter((u) => u.role !== "client" && u.status === "active")
      .map((u) =>
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
    plannedHours: number;
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
  try {
    const authUser = await getAuthoritativeUser();
    if (!authUser) return { success: false, error: "Unauthorized" };

    const data = await fetchAuthoritativeWorkspaceEntities(authUser.orgId);
    const isManagement = authUser.organizationRole === "founder" || authUser.organizationRole === "admin" || authUser.organizationRole === "consultant";

    const todayStr = new Date().toISOString().split("T")[0];
    const thisMonthPeriod = getPeriodDateRange("this_month");
    const thisWeekPeriod = getPeriodDateRange("this_week");

    // 1. Top cards
    const tasksDueToday = data.items.filter((i) => {
      const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
      if (isDone) return false;
      const deadline = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
      return deadline ? deadline.startsWith(todayStr) : false;
    });

    const nowTime = Date.now();
    const overdueTasks = data.items.filter((i) => {
      const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
      if (isDone) return false;
      const deadline = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
      return deadline ? new Date(deadline).getTime() < nowTime : false;
    });

    const completedThisMonth = data.items.filter((i) => {
      const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
      if (!isDone) return false;
      const compDate = (i.completedAt || i.publishedAt || thisMonthPeriod.startDate).split("T")[0];
      return compDate >= thisMonthPeriod.startDate && compDate <= thisMonthPeriod.endDate;
    });

    const adHocThisMonth = data.items
      .filter((i) => {
        if (i.workNature !== "ad_hoc") return false;
        const d = i.deadlines?.scheduledPublicationDate || i.finalInternalDeadline || i.completedAt;
        const dStr = d ? d.split("T")[0] : "";
        return dStr >= thisMonthPeriod.startDate && dStr <= thisMonthPeriod.endDate;
      })
      .reduce((sum, i) => sum + (i.finalPlannedSeconds ? i.finalPlannedSeconds / 3600 : 1.5), 0);

    // 2. Today's Workload rows
    const todaysWorkload = tasksDueToday.map((item) => {
      const proj = data.projects.find((p) => p.id === item.projectId);
      const assignment = data.assignments.find((a) => a.contentItemId === item.id);
      const assignee = assignment ? data.users.find((u) => u.id === assignment.assigneeUserId) : undefined;
      return {
        id: item.id,
        projectId: item.projectId,
        projectName: proj?.name || "Unknown",
        topic: item.topic || item.title,
        title: item.title,
        workType: item.workType || item.contentType,
        internalDeadline: item.finalInternalDeadline || item.calculatedInternalDeadline || item.deadlines?.submissionDeadline || "Today",
        postingDate: item.deadlines?.scheduledPublicationDate || "TBD",
        assigneeName: assignee?.name || "Unassigned",
        plannedHours: item.finalPlannedSeconds ? item.finalPlannedSeconds / 3600 : 2.0,
        status: item.stage,
        priority: item.priority || "normal",
      };
    });

    // 3. Weekly Team Capacity
    const weeklyTeamCapacity = data.users
      .filter((u) => u.role !== "client" && u.status === "active")
      .map((u) =>
        calculateEmployeeScorecard(
          u,
          thisWeekPeriod,
          data.items,
          data.assignments,
          data.workSessions,
          data.changeRequests,
          data.schedules,
          data.adjustments
        )
      );

    // 4. Monthly Project Health
    const monthlyProjectHealth = data.projects.map((p) =>
      calculateProjectPerformance(p, thisMonthPeriod, data.items, data.workSessions, data.commitments, data.perfInputs)
    );

    // 5. Employee Personal View
    let employeePersonalView: MainDashboardDataDTO["employeePersonalView"] = undefined;
    const currentUser = data.users.find((u) => u.id === authUser.id);
    if (currentUser) {
      const userAssignments = data.assignments.filter((a) => a.assigneeUserId === currentUser.id);
      const userItemIds = new Set(userAssignments.map((a) => a.contentItemId));
      const userItems = data.items.filter((i) => userItemIds.has(i.id) || i.accountOwnerId === currentUser.id);

      const dueTodayTasks = userItems.filter((i) => {
        const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
        if (isDone) return false;
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        return dl ? dl.startsWith(todayStr) : false;
      });

      const urgentTasks = userItems.filter((i) => {
        const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
        return !isDone && i.priority === "urgent";
      });

      const userSessionsToday = data.workSessions.filter((s) => s.userId === currentUser.id && s.startedAt.startsWith(todayStr));
      const loggedHoursToday = userSessionsToday.reduce((sum, s) => sum + (s.accumulatedSeconds || 0), 0) / 3600;
      const plannedHoursToday = dueTodayTasks.reduce((sum, i) => sum + (i.finalPlannedSeconds ? i.finalPlannedSeconds / 3600 : 2.0), 0);

      const activeTimer = data.workSessions.find((s) => s.userId === currentUser.id && s.status === "active");

      // Queue split: Today, Tomorrow, Upcoming
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      const queueToday = dueTodayTasks;
      const queueTomorrow = userItems.filter((i) => {
        const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
        if (isDone) return false;
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        return dl ? dl.startsWith(tomorrowStr) : false;
      });
      const queueUpcoming = userItems.filter((i) => {
        const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
        if (isDone) return false;
        const dl = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
        return dl ? dl.split("T")[0] > tomorrowStr : false;
      });

      const weekScorecard = calculateEmployeeScorecard(
        currentUser,
        thisWeekPeriod,
        data.items,
        data.assignments,
        data.workSessions,
        data.changeRequests,
        data.schedules,
        data.adjustments
      );

      employeePersonalView = {
        dueTodayTasks,
        plannedHoursToday: Math.round(plannedHoursToday * 100) / 100,
        loggedHoursToday: Math.round(loggedHoursToday * 100) / 100,
        urgentTasks,
        activeTimer,
        queueToday,
        queueTomorrow,
        queueUpcoming,
        weekScorecard,
      };
    }

    return {
      success: true,
      data: {
        isManagement,
        tasksDueTodayCount: tasksDueToday.length,
        overdueOpenTasksCount: overdueTasks.length,
        adHocHoursThisMonth: Math.round(adHocThisMonth * 100) / 100,
        completedThisMonthCount: completedThisMonth.length,
        todaysWorkload,
        weeklyTeamCapacity,
        monthlyProjectHealth,
        employeePersonalView,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
