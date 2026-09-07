import {
  ContentItem,
  ContentAssignment,
  WorkSession,
  ChangeRequest,
  EmployeeCapacitySchedule,
  CapacityAdjustment,
  EffortStandard,
  ProjectCommitment,
  ProjectPerformanceInput,
  User,
  Project,
} from "../types";

export type PeriodFilter = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

export interface PeriodDateRange {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  label: string;
}

// --- 1. Date & Calendar Utilities (IST Normalized) ---

export function getISTDateString(date: Date = new Date()): string {
  // Convert date to IST (UTC+5:30) YYYY-MM-DD
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  return istTime.toISOString().split("T")[0];
}

export function getPeriodDateRange(
  filter: PeriodFilter,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): PeriodDateRange {
  const istDateStr = getISTDateString(referenceDate);
  const [yearStr, monthStr, dayStr] = istDateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed
  const day = parseInt(dayStr, 10);

  const curr = new Date(Date.UTC(year, month, day));
  const dayOfWeek = curr.getUTCDay(); // 0 is Sunday, 1 is Monday...

  if (filter === "custom" && customStart && customEnd) {
    return {
      startDate: customStart,
      endDate: customEnd,
      label: `${customStart} to ${customEnd}`,
    };
  }

  if (filter === "this_week") {
    // Monday of current week
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mon = new Date(Date.UTC(year, month, day + diffToMon));
    const sun = new Date(Date.UTC(year, month, day + diffToMon + 6));
    const start = mon.toISOString().split("T")[0];
    const end = sun.toISOString().split("T")[0];
    return { startDate: start, endDate: end, label: "This Week" };
  }

  if (filter === "last_week") {
    const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek) - 7;
    const mon = new Date(Date.UTC(year, month, day + diffToMon));
    const sun = new Date(Date.UTC(year, month, day + diffToMon + 6));
    return {
      startDate: mon.toISOString().split("T")[0],
      endDate: sun.toISOString().split("T")[0],
      label: "Last Week",
    };
  }

  if (filter === "this_month") {
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    return {
      startDate: firstDay.toISOString().split("T")[0],
      endDate: lastDay.toISOString().split("T")[0],
      label: "This Month",
    };
  }

  if (filter === "last_month") {
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0));
    return {
      startDate: firstDay.toISOString().split("T")[0],
      endDate: lastDay.toISOString().split("T")[0],
      label: "Last Month",
    };
  }

  // Default fallback: This Month
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return {
    startDate: firstDay.toISOString().split("T")[0],
    endDate: lastDay.toISOString().split("T")[0],
    label: "This Month",
  };
}

export const ACTIVE_ASSIGNMENT_STATUSES = new Set<string>(["assigned", "accepted", "in_progress"]);

export function isAssignmentActive(status: string): boolean {
  return ACTIVE_ASSIGNMENT_STATUSES.has(status);
}

// --- 2. Lead Time & Internal Deadline Calculation ---

export function resolveDeliverableLeadTimeWorkdays(
  item: ContentItem,
  effortStandardsList: EffortStandard[] = []
): { leadTimeWorkdays: number; source: "snapshot" | "effort_standard" | "fallback" } {
  // A. Persisted deliverable lead-time snapshot
  if ((item as any).leadTimeWorkdays && (item as any).leadTimeWorkdays > 0) {
    return { leadTimeWorkdays: (item as any).leadTimeWorkdays, source: "snapshot" };
  }

  // B/C. Effort standard referenced by deliverable
  if (item.workTypeId || item.workType) {
    const matched = effortStandardsList.find(
      (e) => e.id === item.workTypeId || e.workType === item.workType
    );
    if (matched && matched.leadTimeWorkdays && matched.leadTimeWorkdays > 0) {
      return { leadTimeWorkdays: matched.leadTimeWorkdays, source: "effort_standard" };
    }
  }

  // D. Defensive fallback default (logged)
  console.warn(`[LeadTime] Deliverable '${item.id}' (${item.title}) missing lead time snapshot/standard; fallback to 2 workdays.`);
  return { leadTimeWorkdays: 2, source: "fallback" };
}

export function calculateInternalDeadline(postingDate: string | Date, leadTimeWorkdays: number): Date {
  const target = new Date(postingDate);
  let remainingDays = Math.max(0, leadTimeWorkdays);
  const result = new Date(target);

  while (remainingDays > 0) {
    result.setDate(result.getDate() - 1);
    const day = result.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (day !== 0 && day !== 6) {
      remainingDays--;
    }
  }

  return result;
}

// --- 3. Employee Date-Aware Capacity Calculation ---

export interface CalculatedEmployeeCapacity {
  userId: string;
  baseCapacityHours: number;
  adjustmentHours: number;
  finalCapacityHours: number;
  primaryFunction: string;
  creativeEligibility: "primary" | "backup" | "not_eligible";
  scheduleDetails: {
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
    sun: number;
  };
}

export function calculateEmployeePeriodCapacity(
  userId: string,
  startDate: string,
  endDate: string,
  schedules: EmployeeCapacitySchedule[],
  adjustments: CapacityAdjustment[]
): CalculatedEmployeeCapacity {
  // Find schedule matching the period or user defaults
  const userSchedules = schedules.filter((s) => s.userId === userId);
  // Sort descending by effectiveFrom
  userSchedules.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

  // Use schedule effective on or before startDate (or latest available)
  const activeSchedule =
    userSchedules.find((s) => s.effectiveFrom <= endDate && (!s.effectiveTo || s.effectiveTo >= startDate)) ||
    userSchedules[0] ||
    ({
      mondayHours: 8,
      tuesdayHours: 8,
      wednesdayHours: 8,
      thursdayHours: 8,
      fridayHours: 8,
      saturdayHours: 0,
      sundayHours: 0,
      primaryFunction: "Creative",
      creativeEligibility: "primary",
    } as EmployeeCapacitySchedule);

  // Iterate each day in period and calculate base capacity
  let baseHours = 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T23:59:59Z`);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getUTCDay(); // 0 = Sun, 1 = Mon ...
    switch (dayOfWeek) {
      case 1:
        baseHours += Number(activeSchedule.mondayHours || 0);
        break;
      case 2:
        baseHours += Number(activeSchedule.tuesdayHours || 0);
        break;
      case 3:
        baseHours += Number(activeSchedule.wednesdayHours || 0);
        break;
      case 4:
        baseHours += Number(activeSchedule.thursdayHours || 0);
        break;
      case 5:
        baseHours += Number(activeSchedule.fridayHours || 0);
        break;
      case 6:
        baseHours += Number(activeSchedule.saturdayHours || 0);
        break;
      case 0:
        baseHours += Number(activeSchedule.sundayHours || 0);
        break;
    }
  }

  // Sum dated adjustments in range
  const userAdjustments = adjustments.filter(
    (a) => a.userId === userId && a.adjustmentDate >= startDate && a.adjustmentDate <= endDate
  );
  const adjustmentHours = userAdjustments.reduce((sum, a) => sum + Number(a.adjustmentHours || 0), 0);
  const finalCapacityHours = baseHours + adjustmentHours;

  return {
    userId,
    baseCapacityHours: Math.round(baseHours * 100) / 100,
    adjustmentHours: Math.round(adjustmentHours * 100) / 100,
    finalCapacityHours: Math.round(finalCapacityHours * 100) / 100,
    primaryFunction: activeSchedule.primaryFunction || "Creative",
    creativeEligibility: activeSchedule.creativeEligibility || "primary",
    scheduleDetails: {
      mon: Number(activeSchedule.mondayHours || 0),
      tue: Number(activeSchedule.tuesdayHours || 0),
      wed: Number(activeSchedule.wednesdayHours || 0),
      thu: Number(activeSchedule.thursdayHours || 0),
      fri: Number(activeSchedule.fridayHours || 0),
      sat: Number(activeSchedule.saturdayHours || 0),
      sun: Number(activeSchedule.sundayHours || 0),
    },
  };
}

// --- 4. Task Planned & Actual Effort Resolvers ---

export function getTaskPlannedHours(item: ContentItem): number {
  // A. Persisted deliverable effort snapshot (Authoritative Source of Truth)
  if (item.finalPlannedSeconds !== undefined && item.finalPlannedSeconds !== null) {
    return item.finalPlannedSeconds / 3600;
  }
  const contentSec = item.standardContentSeconds || 0;
  const prodSec = item.standardProductionSeconds || 0;
  const revContSec = item.revisionContentSeconds || 0;
  const revProdSec = item.revisionProductionSeconds || 0;
  const totalSec = contentSec + prodSec + revContSec + revProdSec;
  if (totalSec > 0) {
    return totalSec / 3600;
  }

  // B. Work type explicitly referenced (e.g. "Carousel (3.25h)")
  if (item.workType) {
    const m = item.workType.match(/\((\d+(?:\.\d+)?)\s*h\)/i);
    if (m) {
      return parseFloat(m[1]);
    }
  }

  // C. Legacy Content Type Fallback
  if (item.contentType === "carousel") return 3.25;

  // Never silently manufacture a default workload. If all missing, return 0.
  return 0;
}

export function getTaskPlannedHoursOrNull(item: ContentItem): number | null {
  if (item.finalPlannedSeconds !== undefined && item.finalPlannedSeconds !== null) {
    return item.finalPlannedSeconds / 3600;
  }
  const contentSec = item.standardContentSeconds || 0;
  const prodSec = item.standardProductionSeconds || 0;
  const totalSec = contentSec + prodSec;
  if (totalSec > 0) {
    return totalSec / 3600;
  }
  return null;
}

export function calculateItemCollectionPlannedHours(items: ContentItem[]): number {
  const countedGroups = new Set<string>();
  let totalHours = 0;
  for (const item of items) {
    if (item.contentGroupId) {
      if (item.isEffortAnchor) {
        totalHours += getTaskPlannedHours(item);
        countedGroups.add(item.contentGroupId);
      } else if (!countedGroups.has(item.contentGroupId)) {
        totalHours += getTaskPlannedHours(item);
        countedGroups.add(item.contentGroupId);
      } else {
        // Group creative effort already counted; add adaptation effort if present
        if (item.finalPlannedSeconds && !item.isEffortAnchor) {
          totalHours += item.finalPlannedSeconds / 3600;
        }
      }
    } else {
      totalHours += getTaskPlannedHours(item);
    }
  }
  return totalHours;
}

export function getTaskActualHours(itemId: string, workSessions: WorkSession[]): number {
  const sessions = workSessions.filter((s) => s.contentItemId === itemId);
  const totalSec = sessions.reduce((sum, s) => sum + (s.accumulatedSeconds || 0), 0);
  return totalSec / 3600;
}

// --- 5. Capacity Status Definition ---

export type CapacityStatus = "Underallocated" | "Available" | "Healthy" | "Fully Loaded" | "Overloaded";

export function getCapacityStatus(allocationPercent: number): CapacityStatus {
  if (allocationPercent < 60) return "Underallocated";
  if (allocationPercent <= 80) return "Available";
  if (allocationPercent <= 95) return "Healthy";
  if (allocationPercent <= 105) return "Fully Loaded";
  return "Overloaded";
}

// --- 6. Employee Period Performance Scorecard ---

export interface EmployeePeriodScorecard {
  user: User;
  capacity: CalculatedEmployeeCapacity;
  assignedPlannedHours: number;
  actualLoggedHours: number;
  remainingPlannedHours: number; // Unclamped (can be negative)
  allocationPercent: number;     // Assigned / Final Capacity * 100
  utilizationPercent: number;    // Actual / Final Capacity * 100
  capacityStatus: CapacityStatus;
  overtimeHours: number;
  completedTasksCount: number;
  onTimeDeliveredCount: number;
  onTimePercent: number | null;
  efficiencyPercent: number | null; // Planned / Actual * 100
  efficiencyDetails: {
    totalCompletedPlannedHours: number;
    totalCompletedActualHours: number;
    varianceHours: number; // Planned - Actual (> 0 is under standard, < 0 is over standard)
  };
  reworkIncidencePercent: number | null;
  firstPassApprovalPercent: number | null;
  revisionRoundsAvg: number | null;
  adHocHours: number;
  goodwillHours: number;
  assignedTasks: ContentItem[];
  completedTasks: ContentItem[];
  workSessions: WorkSession[];
}

export function calculateEmployeeScorecard(
  user: User,
  period: PeriodDateRange,
  items: ContentItem[],
  assignments: ContentAssignment[],
  workSessions: WorkSession[],
  changeRequests: ChangeRequest[],
  schedules: EmployeeCapacitySchedule[],
  adjustments: CapacityAdjustment[]
): EmployeePeriodScorecard {
  const capacity = calculateEmployeePeriodCapacity(
    user.id,
    period.startDate,
    period.endDate,
    schedules,
    adjustments
  );

  // Active assignments for this user (assigned, accepted, in_progress)
  const userAssignments = assignments.filter((a) => a.assigneeUserId === user.id && ACTIVE_ASSIGNMENT_STATUSES.has(a.status));
  const userAssignmentMap = new Map(userAssignments.map((a) => [a.contentItemId, a]));
  const userItemIds = new Set(userAssignments.map((a) => a.contentItemId));
  const userItems = items.filter((i) => userItemIds.has(i.id) || i.accountableOwnerId === user.id);

  // Filter tasks belonging to this period by operational date precedence:
  // assignment.currentDueAt -> item.finalInternalDeadline -> item.deadlines?.submissionDeadline -> item.submissionDeadline
  const periodTasks = userItems.filter((item) => {
    const asgn = userAssignmentMap.get(item.id);
    const dates = [
      asgn?.currentDueAt,
      asgn?.initialDueAt,
      item.finalInternalDeadline,
      item.calculatedInternalDeadline,
      item.deadlines?.submissionDeadline,
      (item as any).submissionDeadline,
      item.deadlines?.scheduledPublicationDate,
      (item as any).scheduledPublicationDate,
      item.completedAt,
      (item as any).completedAt,
    ].filter(Boolean);

    return dates.some((d) => {
      const dStr = typeof d === "string" ? d.split("T")[0] : getISTDateString(new Date(d!));
      return dStr >= period.startDate && dStr <= period.endDate;
    });
  });

  // Assigned planned hours in period (shared creative effort counted once per ContentGroup, plus platform adaptations)
  const assignedPlannedHours = calculateItemCollectionPlannedHours(periodTasks);

  // Actual hours logged in period
  const userSessionsInPeriod = workSessions.filter((s) => {
    if (s.userId !== user.id) return false;
    const startStr = s.startedAt.split("T")[0];
    return startStr >= period.startDate && startStr <= period.endDate;
  });
  const actualLoggedHours = userSessionsInPeriod.reduce((sum, s) => sum + (s.accumulatedSeconds || 0), 0) / 3600;

  // Unclamped remaining capacity
  const remainingPlannedHours = capacity.finalCapacityHours - assignedPlannedHours;
  const allocationPercent = capacity.finalCapacityHours > 0 ? (assignedPlannedHours / capacity.finalCapacityHours) * 100 : 0;
  const utilizationPercent = capacity.finalCapacityHours > 0 ? (actualLoggedHours / capacity.finalCapacityHours) * 100 : 0;
  const capacityStatus = getCapacityStatus(allocationPercent);

  // Overtime from positive adjustments
  const overtimeHours = adjustments
    .filter((a) => a.userId === user.id && a.kind === "overtime" && a.adjustmentDate >= period.startDate && a.adjustmentDate <= period.endDate)
    .reduce((sum, a) => sum + Number(a.adjustmentHours || 0), 0);

  // Completed tasks in period
  const completedTasks = userItems.filter((item) => {
    const isCompleted = item.completedAt || item.stage === "published" || item.stage === "approved";
    if (!isCompleted) return false;
    const compDate = item.completedAt || item.publishedAt || period.startDate;
    const compDateStr = compDate ? compDate.split("T")[0] : "";
    return compDateStr >= period.startDate && compDateStr <= period.endDate;
  });

  // On-Time Delivery calculation
  let onTimeCount = 0;
  completedTasks.forEach((item) => {
    const compTime = new Date(item.completedAt || item.publishedAt || period.startDate).getTime();
    const deadlineTime = new Date(
      item.finalInternalDeadline || item.calculatedInternalDeadline || item.deadlines?.submissionDeadline || item.deadlines?.scheduledPublicationDate || compTime
    ).getTime();
    if (compTime <= deadlineTime) {
      onTimeCount++;
    }
  });
  const onTimePercent = completedTasks.length > 0 ? (onTimeCount / completedTasks.length) * 100 : null;

  // Efficiency: Planned / Actual on completed tasks (Indexed Map to avoid repeated array scans)
  const itemSessionSeconds = new Map<string, number>();
  for (let idx = 0; idx < workSessions.length; idx++) {
    const s = workSessions[idx];
    if (s.contentItemId) {
      itemSessionSeconds.set(s.contentItemId, (itemSessionSeconds.get(s.contentItemId) || 0) + (s.accumulatedSeconds || 0));
    }
  }

  let totalCompletedPlannedHours = 0;
  let totalCompletedActualHours = 0;
  completedTasks.forEach((item) => {
    totalCompletedPlannedHours += getTaskPlannedHours(item);
    totalCompletedActualHours += (itemSessionSeconds.get(item.id) || 0) / 3600;
  });
  const efficiencyPercent =
    totalCompletedActualHours > 0 ? (totalCompletedPlannedHours / totalCompletedActualHours) * 100 : null;
  const varianceHours = totalCompletedPlannedHours - totalCompletedActualHours;

  // Rework & Review Metrics
  const reviewedTasks = userItems.filter((i) => i.stage !== "draft" && i.stage !== "idea");
  const itemsWithChanges = reviewedTasks.filter((item) => changeRequests.some((cr) => cr.contentItemId === item.id));
  const reworkIncidencePercent = reviewedTasks.length > 0 ? (itemsWithChanges.length / reviewedTasks.length) * 100 : null;
  const approvedTasks = userItems.filter((i) => i.stage === "approved" || i.stage === "published" || i.stage === "scheduled");
  const firstPassApproved = approvedTasks.filter((item) => !changeRequests.some((cr) => cr.contentItemId === item.id));
  const firstPassApprovalPercent = approvedTasks.length > 0 ? (firstPassApproved.length / approvedTasks.length) * 100 : null;

  const totalCRs = changeRequests.filter((cr) => userItemIds.has(cr.contentItemId)).length;
  const revisionRoundsAvg = itemsWithChanges.length > 0 ? totalCRs / itemsWithChanges.length : null;

  // Ad-Hoc and Goodwill hours
  const adHocHours = periodTasks.filter((i) => i.workNature === "ad_hoc").reduce((sum, i) => sum + getTaskPlannedHours(i), 0);
  const goodwillHours = periodTasks.filter((i) => i.scopeClassification === "goodwill").reduce((sum, i) => sum + getTaskPlannedHours(i), 0);

  return {
    user,
    capacity,
    assignedPlannedHours: Math.round(assignedPlannedHours * 100) / 100,
    actualLoggedHours: Math.round(actualLoggedHours * 100) / 100,
    remainingPlannedHours: Math.round(remainingPlannedHours * 100) / 100,
    allocationPercent: Math.round(allocationPercent * 10) / 10,
    utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    capacityStatus,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    completedTasksCount: completedTasks.length,
    onTimeDeliveredCount: onTimeCount,
    onTimePercent: onTimePercent !== null ? Math.round(onTimePercent * 10) / 10 : null,
    efficiencyPercent: efficiencyPercent !== null ? Math.round(efficiencyPercent * 10) / 10 : null,
    efficiencyDetails: {
      totalCompletedPlannedHours: Math.round(totalCompletedPlannedHours * 100) / 100,
      totalCompletedActualHours: Math.round(totalCompletedActualHours * 100) / 100,
      varianceHours: Math.round(varianceHours * 100) / 100,
    },
    reworkIncidencePercent: reworkIncidencePercent !== null ? Math.round(reworkIncidencePercent * 10) / 10 : null,
    firstPassApprovalPercent: firstPassApprovalPercent !== null ? Math.round(firstPassApprovalPercent * 10) / 10 : null,
    revisionRoundsAvg: revisionRoundsAvg !== null ? Math.round(revisionRoundsAvg * 10) / 10 : null,
    adHocHours: Math.round(adHocHours * 100) / 100,
    goodwillHours: Math.round(goodwillHours * 100) / 100,
    assignedTasks: periodTasks,
    completedTasks,
    workSessions: userSessionsInPeriod,
  };
}

// --- 7. Team-Wide Performance Overview ---

export interface TeamPerformanceOverviewDTO {
  period: PeriodDateRange;
  teamCapacityHours: number;
  teamAssignedHours: number;
  teamActualHours: number;
  teamRemainingHours: number;
  teamAllocationPercent: number;
  teamUtilizationPercent: number;
  completedTasksCount: number;
  onTimePercent: number | null;
  onTimePercentage?: number | null;
  reworkIncidencePercent: number | null;
  adHocHours: number;
  goodwillHours: number;
  overdueTasksCount: number;
  activeTimersCount: number;
  employeeScorecards: EmployeePeriodScorecard[];
}

export function calculateTeamPerformanceOverview(
  employees: User[],
  period: PeriodDateRange,
  items: ContentItem[],
  assignments: ContentAssignment[],
  workSessions: WorkSession[],
  changeRequests: ChangeRequest[],
  schedules: EmployeeCapacitySchedule[],
  adjustments: CapacityAdjustment[]
): TeamPerformanceOverviewDTO {
  const employeeScorecards = employees
    .filter((u) => u.role !== "client" && u.status === "active")
    .map((u) =>
      calculateEmployeeScorecard(
        u,
        period,
        items,
        assignments,
        workSessions,
        changeRequests,
        schedules,
        adjustments
      )
    );

  const teamCapacityHours = employeeScorecards.reduce((sum, e) => sum + e.capacity.finalCapacityHours, 0);
  const teamAssignedHours = employeeScorecards.reduce((sum, e) => sum + e.assignedPlannedHours, 0);
  const teamActualHours = employeeScorecards.reduce((sum, e) => sum + e.actualLoggedHours, 0);
  const teamRemainingHours = teamCapacityHours - teamAssignedHours;
  const teamAllocationPercent = teamCapacityHours > 0 ? (teamAssignedHours / teamCapacityHours) * 100 : 0;
  const teamUtilizationPercent = teamCapacityHours > 0 ? (teamActualHours / teamCapacityHours) * 100 : 0;

  const completedTasksCount = employeeScorecards.reduce((sum, e) => sum + e.completedTasksCount, 0);
  const totalOnTimeDelivered = employeeScorecards.reduce((sum, e) => sum + e.onTimeDeliveredCount, 0);
  const onTimePercent = completedTasksCount > 0 ? (totalOnTimeDelivered / completedTasksCount) * 100 : null;

  const adHocHours = employeeScorecards.reduce((sum, e) => sum + e.adHocHours, 0);
  const goodwillHours = employeeScorecards.reduce((sum, e) => sum + e.goodwillHours, 0);

  // Overdue open tasks
  const nowTime = Date.now();
  const overdueTasksCount = items.filter((item) => {
    const isDone = item.completedAt || item.stage === "published" || item.stage === "approved";
    if (isDone) return false;
    const deadline = item.finalInternalDeadline || item.calculatedInternalDeadline || item.deadlines?.submissionDeadline || item.deadlines?.scheduledPublicationDate;
    if (!deadline) return false;
    return new Date(deadline).getTime() < nowTime;
  }).length;

  const activeTimersCount = workSessions.filter((s) => s.status === "active").length;

  // Average rework incidence
  const validReworks = employeeScorecards.filter((e) => e.reworkIncidencePercent !== null);
  const reworkIncidencePercent =
    validReworks.length > 0 ? validReworks.reduce((sum, e) => sum + e.reworkIncidencePercent!, 0) / validReworks.length : null;

  return {
    period,
    teamCapacityHours: Math.round(teamCapacityHours * 100) / 100,
    teamAssignedHours: Math.round(teamAssignedHours * 100) / 100,
    teamActualHours: Math.round(teamActualHours * 100) / 100,
    teamRemainingHours: Math.round(teamRemainingHours * 100) / 100,
    teamAllocationPercent: Math.round(teamAllocationPercent * 10) / 10,
    teamUtilizationPercent: Math.round(teamUtilizationPercent * 10) / 10,
    completedTasksCount,
    onTimePercent: onTimePercent !== null ? Math.round(onTimePercent * 10) / 10 : null,
    onTimePercentage: onTimePercent !== null ? Math.round(onTimePercent * 10) / 10 : null,
    reworkIncidencePercent: reworkIncidencePercent !== null ? Math.round(reworkIncidencePercent * 10) / 10 : null,
    adHocHours: Math.round(adHocHours * 100) / 100,
    goodwillHours: Math.round(goodwillHours * 100) / 100,
    overdueTasksCount,
    activeTimersCount,
    employeeScorecards,
  };
}

// --- 8. Project Operational Performance & Commitments ---

export interface ProjectPerformanceScorecard {
  project: Project;
  plannedTasksCount: number;
  completedTasksCount: number;
  pendingTasksCount: number;
  overdueTasksCount: number;
  plannedHours: number;
  actualHours: number;
  varianceHours: number;
  adHocHours: number;
  goodwillHours: number;
  completionPercent: number;
  commitments: {
    workTypeName: string;
    committedQuantity: number;
    fulfilledContractedQuantity: number;
    percent: number;
  }[];
  advertising?: {
    adBudget: number;
    adSpend: number;
    leads: number;
    conversions: number;
    cpl: number | null;
    conversionRate: number | null;
    costPerConversion: number | null;
  };
}

export function calculateProjectPerformance(
  project: Project,
  period: PeriodDateRange,
  items: ContentItem[],
  workSessions: WorkSession[],
  commitments: ProjectCommitment[],
  perfInputs: ProjectPerformanceInput[]
): ProjectPerformanceScorecard {
  const projectItems = items.filter((i) => i.projectId === project.id);
  const periodItems = projectItems.filter((i) => {
    const d = i.deadlines?.scheduledPublicationDate || i.finalInternalDeadline || i.deadlines?.submissionDeadline || i.completedAt;
    const dStr = typeof d === "string" ? d.split("T")[0] : (d ? getISTDateString(new Date(d)) : "");
    return dStr >= period.startDate && dStr <= period.endDate;
  });

  const plannedTasksCount = periodItems.length;
  const completedTasks = periodItems.filter((i) => i.completedAt || i.stage === "published" || i.stage === "approved");
  const completedTasksCount = completedTasks.length;
  const pendingTasksCount = plannedTasksCount - completedTasksCount;

  const nowTime = Date.now();
  const overdueTasksCount = periodItems.filter((i) => {
    const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
    if (isDone) return false;
    const deadline = i.finalInternalDeadline || i.calculatedInternalDeadline || i.deadlines?.submissionDeadline;
    return deadline ? new Date(deadline).getTime() < nowTime : false;
  }).length;

  const plannedHours = calculateItemCollectionPlannedHours(periodItems);
  
  // Indexed Map for actual hours per item to eliminate O(N*M) nested scans
  const projItemSessionSeconds = new Map<string, number>();
  for (let idx = 0; idx < workSessions.length; idx++) {
    const s = workSessions[idx];
    if (s.contentItemId) {
      projItemSessionSeconds.set(s.contentItemId, (projItemSessionSeconds.get(s.contentItemId) || 0) + (s.accumulatedSeconds || 0));
    }
  }

  // Sum work sessions attributable to this project within the period
  const projectPeriodSessions = workSessions.filter((s) => {
    if (s.projectId !== project.id) return false;
    const sDate = s.startedAt ? getISTDateString(new Date(s.startedAt)) : "";
    return sDate >= period.startDate && sDate <= period.endDate;
  });
  const actualHours = Math.round(projectPeriodSessions.reduce((sum, s) => sum + (s.accumulatedSeconds || 0), 0) / 36) / 100;
  const varianceHours = plannedHours - actualHours;
  const adHocHours = periodItems.filter((i) => i.workNature === "ad_hoc").reduce((sum, i) => sum + getTaskPlannedHours(i), 0);
  const goodwillHours = periodItems.filter((i) => i.scopeClassification === "goodwill").reduce((sum, i) => sum + getTaskPlannedHours(i), 0);
  const completionPercent = plannedTasksCount > 0 ? (completedTasksCount / plannedTasksCount) * 100 : 0;

  // Monthly Commitments calculation (Only CONTRACTED items count toward fulfillment)
  const monthStart = `${period.startDate.slice(0, 7)}-01`;
  const projectCommitmentList = commitments.filter((c) => c.projectId === project.id && c.effectiveMonth.startsWith(period.startDate.slice(0, 7)));

  const commitmentSummaries = projectCommitmentList.map((c) => {
    // Fulfilled count is completed tasks in this month where workType matches AND scopeClassification === 'contracted'
    const fulfilledContractedQuantity = projectItems.filter((i) => {
      const isDone = i.completedAt || i.stage === "published" || i.stage === "approved";
      if (!isDone) return false;
      if (i.scopeClassification !== "contracted") return false; // Goodwill / Additional Billable do NOT count toward quota
      const compDateStr = (i.completedAt || i.publishedAt || period.startDate).split("T")[0];
      const isSameMonth = compDateStr.startsWith(period.startDate.slice(0, 7));
      const isSameWorkType = (i.workType || "").toLowerCase() === c.workTypeName.toLowerCase();
      return isSameMonth && isSameWorkType;
    }).length;

    const percent = c.committedQuantity > 0 ? Math.min(100, (fulfilledContractedQuantity / c.committedQuantity) * 100) : 100;
    return {
      workTypeName: c.workTypeName,
      committedQuantity: c.committedQuantity,
      fulfilledContractedQuantity,
      percent: Math.round(percent * 10) / 10,
    };
  });

  // Advertising inputs for performance projects
  const adInput = perfInputs.find((p) => p.projectId === project.id && p.effectiveMonth.startsWith(period.startDate.slice(0, 7)));
  let advertising: ProjectPerformanceScorecard["advertising"] = undefined;
  if (adInput) {
    const budget = Number(adInput.adBudget || 0);
    const spend = Number(adInput.adSpend || 0);
    const leads = Number(adInput.leads || 0);
    const conversions = Number(adInput.conversions || 0);
    advertising = {
      adBudget: budget,
      adSpend: spend,
      leads,
      conversions,
      cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
      conversionRate: leads > 0 ? Math.round(((conversions / leads) * 100) * 10) / 10 : null,
      costPerConversion: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : null,
    };
  }

  return {
    project,
    plannedTasksCount,
    completedTasksCount,
    pendingTasksCount,
    overdueTasksCount,
    plannedHours: Math.round(plannedHours * 100) / 100,
    actualHours: Math.round(actualHours * 100) / 100,
    varianceHours: Math.round(varianceHours * 100) / 100,
    adHocHours: Math.round(adHocHours * 100) / 100,
    goodwillHours: Math.round(goodwillHours * 100) / 100,
    completionPercent: Math.round(completionPercent * 10) / 10,
    commitments: commitmentSummaries,
    advertising,
  };
}

// --- 9. Effort Standards vs Actual Analysis ---

export interface EffortAnalysisRow {
  workType: string;
  category: string;
  standardBaseHours: number;
  averageActualHours: number | null;
  varianceHours: number | null;
  completedTasksCount: number;
}

export function calculateEffortAnalysis(
  standards: EffortStandard[],
  completedItems: ContentItem[],
  workSessions: WorkSession[]
): EffortAnalysisRow[] {
  return standards.map((std) => {
    const matchingTasks = completedItems.filter(
      (i) => (i.workType || "").toLowerCase() === std.workType.toLowerCase()
    );
    const taskCount = matchingTasks.length;
    const stdHours = std.totalSeconds / 3600;

    if (taskCount === 0) {
      return {
        workType: std.workType,
        category: std.category,
        standardBaseHours: stdHours,
        averageActualHours: null,
        varianceHours: null,
        completedTasksCount: 0,
      };
    }

    const totalActual = matchingTasks.reduce((sum, item) => sum + getTaskActualHours(item.id, workSessions), 0);
    const avgActual = totalActual / taskCount;
    const variance = stdHours - avgActual;

    return {
      workType: std.workType,
      category: std.category,
      standardBaseHours: stdHours,
      averageActualHours: Math.round(avgActual * 100) / 100,
      varianceHours: Math.round(variance * 100) / 100,
      completedTasksCount: taskCount,
    };
  });
}
