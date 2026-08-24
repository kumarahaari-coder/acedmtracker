import {
  AppState,
  ContentAssignment,
  ContentItem,
  Project,
  SubmissionVersion,
  User,
  UserRole,
  WorkSession,
  ApprovalDecision,
  ChangeRequest,
  AttendanceRecord,
} from "./types";
import { getComponentApprovalSummary, getItemApprovalMatrixSummary } from "./derived";

// --- DTO DEFINITIONS ---

export interface PerformanceFilters {
  dateRange?: "7d" | "30d" | "90d" | "all" | "custom";
  startDate?: string;
  endDate?: string;
  projectId?: string;
  designerId?: string;
  platform?: string;
  contentType?: string;
  userStatus?: "active" | "inactive" | "all";
}

export interface TeamPerformanceOverview {
  // Output Counts
  completedDeliverablesCount: number;
  completedConceptsCount: number;
  totalAssignmentsCount: number;

  // Delivery & Quality KPIs (null if insufficient data)
  onTimeDeliveryRate: number | null; // e.g. 91.5 (%)
  onTimeEligibleCount: number;
  onTimeDeliveredCount: number;
  avgDelayHoursOnLateDeliveries: number | null; // only across late items

  firstPassApprovalRate: number | null; // e.g. 78.0 (%)
  firstPassEligibleCount: number;
  firstPassApprovedCount: number;

  avgRevisionRounds: number | null; // e.g. 1.3
  totalRevisionCyclesCount: number;

  // Time & Effort
  totalTrackedSeconds: number;
  avgProductionTimeSeconds: number | null; // per completed primary deliverable

  // Live Workload & Attendance Context (Current State)
  activeAssignmentsCount: number;
  overdueAssignmentsCount: number;
  activeTimersCount: number;
  teamCheckedInTodayCount: number;
  totalTeamMembersCount: number;
}

export interface DesignerPerformanceSummary {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  jobTitle?: string;
  userStatus: "active" | "inactive";

  // Output
  completedDeliverablesCount: number;
  completedConceptsCount: number;
  primaryAssignmentsCount: number;
  collaborationsCount: number;

  // KPIs
  onTimeDeliveryRate: number | null;
  firstPassApprovalRate: number | null;
  avgRevisionRounds: number | null;
  totalTrackedSeconds: number;
  avgProductionTimeSeconds: number | null;

  // Current Live Workload
  activeAssignmentsCount: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
  overdueCount: number;
  hasActiveTimer: boolean;
  activeTimerTaskTitle?: string;
  activeTimerDurationSeconds?: number;

  // Attendance Context (Current State)
  isCheckedInToday: boolean;
  todayCheckInTime?: string;
}

export interface DesignerWorkloadSummary {
  userId: string;
  name: string;
  avatar: string;
  role: UserRole;
  userStatus: "active" | "inactive";

  // Workload
  activeAssignmentsCount: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
  overdueCount: number;

  // Active Timer
  hasActiveTimer: boolean;
  activeTimerSessionId?: string;
  activeTimerTaskTitle?: string;
  activeTimerItemPlatform?: string;
  activeTimerProjectName?: string;
  activeTimerStartedAt?: string;

  // Today's Tracked Time
  trackedTodaySeconds: number;

  // Attendance Presence
  attendanceStatus: "checked_in" | "checked_out" | "not_checked_in";
  checkInTime?: string;

  // Capacity Warning
  capacityRisk: boolean;
  capacityRiskReason?: string;

  // Active Assignment Summaries
  activeAssignments: Array<{
    assignmentId: string;
    contentItemId: string;
    title: string;
    projectName: string;
    platform: string;
    contentType: string;
    status: string;
    currentDueAt?: string;
    isOverdue: boolean;
  }>;
}

export interface DesignerPerformanceDetail {
  user: User;

  // Section A: Productivity
  productivity: {
    completedDeliverablesCount: number;
    completedConceptsCount: number;
    totalTrackedSeconds: number;
    avgProductionTimeSeconds: number | null;
    timeByContentType: Record<string, number>; // contentType -> seconds
    outputByPlatform: Record<string, number>; // platform -> count
    outputByProject: Record<string, { deliverables: number; seconds: number }>;
    activeAssignmentsCount: number;
    completedAssignmentsCount: number;
  };

  // Section B: Delivery Reliability
  delivery: {
    onTimeDeliveryRate: number | null;
    onTimeDeliveriesCount: number;
    lateDeliveriesCount: number;
    eligibleSubmissionsCount: number;
    avgDelayHoursOnLate: number | null;
    dueTodayCount: number;
    dueThisWeekCount: number;
    overdueCount: number;
    history: Array<{
      contentItemId: string;
      title: string;
      platform: string;
      projectName: string;
      firstSubmittedAt: string;
      effectiveDueAt: string;
      isOnTime: boolean;
      delayHours?: number;
    }>;
  };

  // Section C: Review Efficiency
  reviewEfficiency: {
    firstPassApprovalRate: number | null;
    firstPassApprovedCount: number;
    firstPassEligibleCount: number;
    avgRevisionRounds: number | null;
    totalChangeRequestsReceived: number;
    revisionsByComponent: {
      copy: number;
      creative: number;
      posting_date: number;
    };
  };

  // Section D: Output Trends
  trends: {
    weeklyCompleted: Array<{ weekLabel: string; count: number; trackedSeconds: number }>;
    contentTypeDistribution: Record<string, number>;
    platformDistribution: Record<string, number>;
    projectDistribution: Record<string, number>;
  };

  // Section E: Attendance Context
  attendanceContext: {
    daysPresentInRange: number;
    isCheckedInToday: boolean;
    todayCheckInTime?: string;
    todayCheckOutTime?: string;
    totalTrackedTodaySeconds: number;
  };
}

// --- ACCESS CONTROL & AUTHORIZATION ---

export function validatePerformanceAccess(
  state: AppState,
  actorUserId: string,
  actorRole: UserRole,
  targetProjectId?: string
): { authorized: boolean; error?: string; authorizedProjectIds?: string[] } {
  const actor = state.users.find((u) => u.id === actorUserId);
  if (!actor || actor.status === "inactive") {
    return { authorized: false, error: "Access denied. Account is inactive or unauthenticated." };
  }

  // Founder and Admin have full organization-wide access
  if (actorRole === "founder" || actorRole === "admin") {
    const activeProjectIds = state.projects.filter((p) => p.status !== "archived").map((p) => p.id);
    return { authorized: true, authorizedProjectIds: activeProjectIds };
  }

  // Consultant has access scoped strictly to active ProjectMemberships
  if (actorRole === "consultant") {
    const memberships = state.projectMemberships.filter(
      (m) => m.userId === actorUserId && m.status === "active"
    );
    const authorizedProjectIds = memberships.map((m) => m.projectId);

    if (targetProjectId) {
      if (!authorizedProjectIds.includes(targetProjectId)) {
        return {
          authorized: false,
          error: "Access denied. You do not have an active membership in this project.",
        };
      }
      return { authorized: true, authorizedProjectIds: [targetProjectId] };
    }

    if (authorizedProjectIds.length === 0) {
      return { authorized: false, error: "Access denied. You have no active project memberships." };
    }

    return { authorized: true, authorizedProjectIds };
  }

  // Designer, Client, External Reviewer are denied from internal performance analytics
  return {
    authorized: false,
    error: "Forbidden. Performance analytics are restricted to authorized management roles.",
  };
}

// --- HELPER FILTERING ENGINE ---

export function filterStateToScope(
  state: AppState,
  authorizedProjectIds: string[],
  filters?: PerformanceFilters
): {
  projects: Project[];
  contentItems: ContentItem[];
  assignments: ContentAssignment[];
  workSessions: WorkSession[];
  submissionVersions: SubmissionVersion[];
  changeRequests: ChangeRequest[];
  attendanceRecords: AttendanceRecord[];
} {
  // Pre-filter projects by authorized scope
  let projects = state.projects.filter((p) => authorizedProjectIds.includes(p.id));
  if (filters?.projectId && filters.projectId !== "all") {
    projects = projects.filter((p) => p.id === filters.projectId);
  }
  const projectIds = new Set(projects.map((p) => p.id));

  // Filter content items
  let contentItems = state.contentItems.filter((i) => projectIds.has(i.projectId));
  if (filters?.platform && filters.platform !== "all") {
    contentItems = contentItems.filter((i) => i.platform.toLowerCase() === filters.platform!.toLowerCase());
  }
  if (filters?.contentType && filters.contentType !== "all") {
    contentItems = contentItems.filter((i) => i.contentType.toLowerCase() === filters.contentType!.toLowerCase());
  }
  const itemIds = new Set(contentItems.map((i) => i.id));

  // Filter assignments
  let assignments = state.contentAssignments.filter((a) => itemIds.has(a.contentItemId));
  if (filters?.designerId && filters.designerId !== "all") {
    assignments = assignments.filter((a) => a.assigneeUserId === filters.designerId);
  }
  const assignmentIds = new Set(assignments.map((a) => a.id));

  // Filter submission versions
  const submissionVersions = state.submissionVersions.filter((v) => itemIds.has(v.contentItemId));

  // Filter change requests
  const changeRequests = state.changeRequests.filter((cr) => itemIds.has(cr.contentItemId));

  // Filter work sessions (must belong to filtered assignments)
  let workSessions = state.workSessions.filter((ws) => assignmentIds.has(ws.assignmentId));

  // Date range filtering for historical events
  if (filters?.dateRange && filters.dateRange !== "all") {
    const now = new Date().getTime();
    let minTime = 0;
    if (filters.dateRange === "7d") minTime = now - 7 * 86400000;
    else if (filters.dateRange === "30d") minTime = now - 30 * 86400000;
    else if (filters.dateRange === "90d") minTime = now - 90 * 86400000;
    else if (filters.dateRange === "custom" && filters.startDate) {
      minTime = new Date(filters.startDate).getTime();
    }

    let maxTime = Number.MAX_SAFE_INTEGER;
    if (filters.dateRange === "custom" && filters.endDate) {
      maxTime = new Date(filters.endDate).getTime();
    }

    // Filter work sessions by range
    workSessions = workSessions.filter((ws) => {
      const t = new Date(ws.startedAt).getTime();
      return t >= minTime && t <= maxTime;
    });
  }

  // Attendance records (contextual)
  const attendanceRecords = state.attendanceRecords;

  return {
    projects,
    contentItems,
    assignments,
    workSessions,
    submissionVersions,
    changeRequests,
    attendanceRecords,
  };
}

// --- DETERMINISTIC METRIC CALCULATORS ---

export function calculateEffectiveProductionSeconds(sessions: WorkSession[]): number {
  let total = 0;
  for (const s of sessions) {
    if (s.adjustments && s.adjustments.length > 0) {
      const latestAdj = s.adjustments[s.adjustments.length - 1];
      total += latestAdj.adjustedDurationSeconds;
    } else if (s.accumulatedSeconds) {
      total += s.accumulatedSeconds;
    }
  }
  return total;
}

export function isAssignmentCompleted(assignment: ContentAssignment, item?: ContentItem): boolean {
  if (assignment.status === "completed") return true;
  if (item && (item.stage === "approved" || item.stage === "scheduled" || item.stage === "published" || item.stage === "reported")) {
    return true;
  }
  return false;
}

export function getFirstFormalSubmission(
  assignment: ContentAssignment,
  itemVersions: SubmissionVersion[]
): { version?: SubmissionVersion; firstSubmittedAt?: string } {
  // Find versions linked to this content item that were formally submitted
  const submittedVersions = itemVersions
    .filter((v) => v.contentItemId === assignment.contentItemId && !v.isDraft && v.submittedAt)
    .sort((a, b) => new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime());

  if (submittedVersions.length > 0) {
    return {
      version: submittedVersions[0],
      firstSubmittedAt: submittedVersions[0].submittedAt,
    };
  }

  if (assignment.firstSubmittedAt) {
    return { firstSubmittedAt: assignment.firstSubmittedAt };
  }

  return {};
}

export function getEffectiveDueAtSubmissionTime(
  assignment: ContentAssignment,
  submissionTime: string
): string | undefined {
  const subTime = new Date(submissionTime).getTime();

  // If deadline history exists, find the effective due date as of submissionTime
  if (assignment.dueAtHistory && assignment.dueAtHistory.length > 0) {
    const sorted = [...assignment.dueAtHistory].sort(
      (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
    );
    // Find the latest change that happened BEFORE or AT submissionTime
    let effective = assignment.initialDueAt;
    for (const change of sorted) {
      if (new Date(change.changedAt).getTime() <= subTime) {
        effective = change.newDueAt;
      }
    }
    return effective;
  }

  return assignment.initialDueAt || assignment.currentDueAt;
}

export function evaluateFirstPassApproval(
  item: ContentItem,
  versions: SubmissionVersion[],
  decisions: ApprovalDecision[],
  changeRequests: ChangeRequest[]
): boolean | null {
  // Must have a formal review submission
  const firstSubmission = versions
    .filter((v) => v.contentItemId === item.id && !v.isDraft && v.submittedAt)
    .sort((a, b) => new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime())[0];

  if (!firstSubmission) return null; // Ineligible / Draft only

  // If any change request was opened for this item before first approval, fails first pass
  const crs = changeRequests.filter((cr) => cr.contentItemId === item.id);
  if (crs.length > 0) {
    // Check if CR occurred during or after first version
    return false;
  }

  // Check component approval summary on the first submission version
  const copySummary = getComponentApprovalSummary("copy", firstSubmission, decisions);
  const creativeSummary = getComponentApprovalSummary("creative", firstSubmission, decisions);
  const dateSummary = getComponentApprovalSummary("posting_date", firstSubmission, decisions);

  // If any component had changes requested, first pass fails
  if (copySummary.hasChangesRequested || creativeSummary.hasChangesRequested || dateSummary.hasChangesRequested) {
    return false;
  }

  // If all components are approved, passes first pass
  if (copySummary.isFullyApproved && creativeSummary.isFullyApproved && dateSummary.isFullyApproved) {
    return true;
  }

  // If item reached approved/published stage with version 1 and 0 change requests
  if (item.stage === "approved" || item.stage === "scheduled" || item.stage === "published") {
    if (item.currentVersionNumber === 1 && crs.length === 0) {
      return true;
    }
  }

  return null; // Not yet fully decided or incomplete
}

export function countRevisionRounds(
  assignment: ContentAssignment,
  itemVersions: SubmissionVersion[],
  changeRequests: ChangeRequest[]
): number {
  // Count formal submitted versions beyond version 1
  const formalVersions = itemVersions.filter(
    (v) => v.contentItemId === assignment.contentItemId && !v.isDraft && v.submittedAt
  );

  if (formalVersions.length > 1) {
    return formalVersions.length - 1;
  }

  // Or count resolved change requests for this item
  const crCount = changeRequests.filter(
    (cr) => cr.contentItemId === assignment.contentItemId && (cr.status === "resolved" || cr.status === "open")
  ).length;

  return crCount;
}

// --- PUBLIC SELECTOR FUNCTIONS ---

export function getOrganizationPerformance(
  state: AppState,
  actorUserId: string,
  actorRole: UserRole,
  filters?: PerformanceFilters
): { status: number; error?: string; data?: { overview: TeamPerformanceOverview; scorecards: DesignerPerformanceSummary[]; workload: DesignerWorkloadSummary[] } } {
  const auth = validatePerformanceAccess(state, actorUserId, actorRole, filters?.projectId);
  if (!auth.authorized || !auth.authorizedProjectIds) {
    return { status: 403, error: auth.error || "Access Denied." };
  }

  const scoped = filterStateToScope(state, auth.authorizedProjectIds, filters);

  // Designers list in organization
  let designers = state.users.filter(
    (u) => u.role === "designer" || u.jobTitle?.toLowerCase().includes("designer") || u.jobTitle?.toLowerCase().includes("editor")
  );

  if (filters?.designerId && filters.designerId !== "all") {
    designers = designers.filter((u) => u.id === filters.designerId);
  }
  if (filters?.userStatus && filters.userStatus !== "all") {
    designers = designers.filter((u) => u.status === filters.userStatus);
  }

  // --- COMPUTE TOP-LEVEL TEAM OVERVIEW ---
  let completedDeliverablesCount = 0;
  const completedConceptIds = new Set<string>();

  let onTimeEligibleCount = 0;
  let onTimeDeliveredCount = 0;
  let totalDelayHoursOnLate = 0;
  let lateDeliveriesCount = 0;

  let firstPassEligibleCount = 0;
  let firstPassApprovedCount = 0;

  let totalRevisionCyclesCount = 0;
  let revisionEligibleAssignments = 0;

  let totalTrackedSeconds = calculateEffectiveProductionSeconds(scoped.workSessions);
  let productionTimeEligibleDeliverables = 0;
  let productionTimeTotalSeconds = 0;

  const scorecards: DesignerPerformanceSummary[] = [];

  for (const designer of designers) {
    const designerAssignments = scoped.assignments.filter((a) => a.assigneeUserId === designer.id);
    const primaryAssignments = designerAssignments.filter(
      (a) => a.assignmentRole === "designer" || a.assignmentRole === "video_editor"
    );
    const collaborations = designerAssignments.filter((a) => a.assignmentRole === "collaborator");

    const designerSessions = scoped.workSessions.filter((ws) =>
      designerAssignments.some((a) => a.id === ws.assignmentId)
    );
    const designerTrackedSeconds = calculateEffectiveProductionSeconds(designerSessions);

    let dCompletedDeliverables = 0;
    const dConceptIds = new Set<string>();

    let dOnTimeEligible = 0;
    let dOnTimeDelivered = 0;
    let dFirstPassEligible = 0;
    let dFirstPassApproved = 0;
    let dRevisionCycles = 0;
    let dCompletedPrimaryWithTime = 0;
    let dPrimaryProductionSeconds = 0;

    for (const a of primaryAssignments) {
      const item = scoped.contentItems.find((i) => i.id === a.contentItemId);
      const isComp = isAssignmentCompleted(a, item);

      if (isComp) {
        dCompletedDeliverables++;
        completedDeliverablesCount++;

        // Concept tracking
        if (item?.contentGroupId) {
          dConceptIds.add(item.contentGroupId);
          completedConceptIds.add(item.contentGroupId);
        } else if (item) {
          dConceptIds.add(`standalone_${item.id}`);
          completedConceptIds.add(`standalone_${item.id}`);
        }

        // Production time
        const itemSessions = designerSessions.filter((ws) => ws.assignmentId === a.id);
        const itemSec = calculateEffectiveProductionSeconds(itemSessions);
        if (itemSec > 0) {
          dCompletedPrimaryWithTime++;
          dPrimaryProductionSeconds += itemSec;
          productionTimeEligibleDeliverables++;
          productionTimeTotalSeconds += itemSec;
        }
      }

      // On-Time Delivery calculation
      const { firstSubmittedAt } = getFirstFormalSubmission(a, scoped.submissionVersions);
      if (firstSubmittedAt) {
        const effectiveDue = getEffectiveDueAtSubmissionTime(a, firstSubmittedAt);
        if (effectiveDue) {
          dOnTimeEligible++;
          onTimeEligibleCount++;

          const isOntime = new Date(firstSubmittedAt).getTime() <= new Date(effectiveDue).getTime();
          if (isOntime) {
            dOnTimeDelivered++;
            onTimeDeliveredCount++;
          } else {
            lateDeliveriesCount++;
            const delayMs = new Date(firstSubmittedAt).getTime() - new Date(effectiveDue).getTime();
            totalDelayHoursOnLate += delayMs / 3600000;
          }
        }
      }

      // First-Pass Approval calculation
      if (item) {
        const fpResult = evaluateFirstPassApproval(
          item,
          scoped.submissionVersions,
          state.approvalDecisions,
          scoped.changeRequests
        );
        if (fpResult !== null) {
          dFirstPassEligible++;
          firstPassEligibleCount++;
          if (fpResult === true) {
            dFirstPassApproved++;
            firstPassApprovedCount++;
          }
        }
      }

      // Revision rounds
      const revs = countRevisionRounds(a, scoped.submissionVersions, scoped.changeRequests);
      dRevisionCycles += revs;
      totalRevisionCyclesCount += revs;
      if (isComp) revisionEligibleAssignments++;
    }

    // Designer Workload & Live Timers (Current State)
    const activeAssignments = designerAssignments.filter(
      (a) => a.status === "assigned" || a.status === "accepted" || a.status === "in_progress"
    );

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);

    let dueTodayCount = 0;
    let dueThisWeekCount = 0;
    let overdueCount = 0;

    for (const a of activeAssignments) {
      if (a.currentDueAt) {
        const dueDate = new Date(a.currentDueAt);
        if (dueDate.getTime() < now.getTime()) {
          overdueCount++;
        } else {
          if (a.currentDueAt.startsWith(todayStr)) dueTodayCount++;
          if (dueDate.getTime() <= weekFromNow.getTime()) dueThisWeekCount++;
        }
      }
    }

    // Active Timer Check
    const activeTimerSession = state.workSessions.find(
      (ws) => ws.userId === designer.id && ws.status === "active"
    );
    const activeTimerItem = activeTimerSession
      ? state.contentItems.find((i) => i.id === activeTimerSession.contentItemId)
      : undefined;

    // Today's Attendance Check (Asia/Kolkata)
    const todayAttendance = state.attendanceRecords.find(
      (ar) => ar.userId === designer.id && ar.attendanceDate === todayStr
    );

    scorecards.push({
      userId: designer.id,
      name: designer.name,
      email: designer.email,
      avatar: designer.avatar,
      role: designer.role,
      jobTitle: designer.jobTitle,
      userStatus: designer.status,
      completedDeliverablesCount: dCompletedDeliverables,
      completedConceptsCount: dConceptIds.size,
      primaryAssignmentsCount: primaryAssignments.length,
      collaborationsCount: collaborations.length,
      onTimeDeliveryRate: dOnTimeEligible > 0 ? Math.round((dOnTimeDelivered / dOnTimeEligible) * 1000) / 10 : null,
      firstPassApprovalRate: dFirstPassEligible > 0 ? Math.round((dFirstPassApproved / dFirstPassEligible) * 1000) / 10 : null,
      avgRevisionRounds: dCompletedDeliverables > 0 ? Math.round((dRevisionCycles / dCompletedDeliverables) * 10) / 10 : null,
      totalTrackedSeconds: designerTrackedSeconds,
      avgProductionTimeSeconds: dCompletedPrimaryWithTime > 0 ? Math.round(dPrimaryProductionSeconds / dCompletedPrimaryWithTime) : null,
      activeAssignmentsCount: activeAssignments.length,
      dueTodayCount,
      dueThisWeekCount,
      overdueCount,
      hasActiveTimer: !!activeTimerSession,
      activeTimerTaskTitle: activeTimerItem?.title,
      activeTimerDurationSeconds: activeTimerSession?.accumulatedSeconds,
      isCheckedInToday: !!todayAttendance && !todayAttendance.checkedOutAt,
      todayCheckInTime: todayAttendance?.checkedInAt,
    });
  }

  // --- WORKLOAD BOARD GENERATION ---
  const workload: DesignerWorkloadSummary[] = designers
    .filter((d) => (filters?.userStatus === "inactive" ? true : d.status === "active"))
    .map((designer) => {
      const dAssignments = scoped.assignments.filter((a) => a.assigneeUserId === designer.id);
      const activeAssignments = dAssignments.filter(
        (a) => a.status === "assigned" || a.status === "accepted" || a.status === "in_progress"
      );

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const weekFromNow = new Date(now.getTime() + 7 * 86400000);

      let dueTodayCount = 0;
      let dueThisWeekCount = 0;
      let overdueCount = 0;

      const activeList = activeAssignments.map((a) => {
        const item = scoped.contentItems.find((i) => i.id === a.contentItemId);
        const proj = scoped.projects.find((p) => p.id === a.projectId);
        const isOverdue = a.currentDueAt ? new Date(a.currentDueAt).getTime() < now.getTime() : false;

        if (a.currentDueAt) {
          const dueDate = new Date(a.currentDueAt);
          if (isOverdue) overdueCount++;
          else {
            if (a.currentDueAt.startsWith(todayStr)) dueTodayCount++;
            if (dueDate.getTime() <= weekFromNow.getTime()) dueThisWeekCount++;
          }
        }

        return {
          assignmentId: a.id,
          contentItemId: a.contentItemId,
          title: item?.title || "Untitled Deliverable",
          projectName: proj?.name || "Project",
          platform: item?.platform || "Channel",
          contentType: item?.contentType || "post",
          status: a.status,
          currentDueAt: a.currentDueAt,
          isOverdue,
        };
      });

      const activeTimer = state.workSessions.find((ws) => ws.userId === designer.id && ws.status === "active");
      const timerItem = activeTimer ? state.contentItems.find((i) => i.id === activeTimer.contentItemId) : undefined;
      const timerProj = activeTimer ? state.projects.find((p) => p.id === activeTimer.projectId) : undefined;

      // Tracked today
      const todaySessions = state.workSessions.filter(
        (ws) => ws.userId === designer.id && ws.startedAt.startsWith(todayStr)
      );
      const trackedTodaySeconds = calculateEffectiveProductionSeconds(todaySessions);

      // Attendance
      const todayAttendance = state.attendanceRecords.find(
        (ar) => ar.userId === designer.id && ar.attendanceDate === todayStr
      );
      let attendanceStatus: "checked_in" | "checked_out" | "not_checked_in" = "not_checked_in";
      if (todayAttendance) {
        attendanceStatus = todayAttendance.checkedOutAt ? "checked_out" : "checked_in";
      }

      // Capacity Risk Check with explainable reasons
      let capacityRisk = false;
      let capacityRiskReason: string | undefined;

      if (overdueCount >= 2 || (overdueCount >= 1 && dueTodayCount >= 2)) {
        capacityRisk = true;
        capacityRiskReason = `${overdueCount} overdue deliverables and ${dueTodayCount} due today`;
      } else if (activeAssignments.length >= 8) {
        capacityRisk = true;
        capacityRiskReason = `High concurrent open workload (${activeAssignments.length} active tasks)`;
      } else if (dueTodayCount >= 4) {
        capacityRisk = true;
        capacityRiskReason = `${dueTodayCount} deliverables due today`;
      }

      return {
        userId: designer.id,
        name: designer.name,
        avatar: designer.avatar,
        role: designer.role,
        userStatus: designer.status,
        activeAssignmentsCount: activeAssignments.length,
        dueTodayCount,
        dueThisWeekCount,
        overdueCount,
        hasActiveTimer: !!activeTimer,
        activeTimerSessionId: activeTimer?.id,
        activeTimerTaskTitle: timerItem?.title,
        activeTimerItemPlatform: timerItem?.platform,
        activeTimerProjectName: timerProj?.name,
        activeTimerStartedAt: activeTimer?.startedAt,
        trackedTodaySeconds,
        attendanceStatus,
        checkInTime: todayAttendance?.checkedInAt,
        capacityRisk,
        capacityRiskReason,
        activeAssignments: activeList,
      };
    });

  // Top-Level Team Aggregates
  const totalTeamMembersCount = designers.filter((d) => d.status === "active").length;
  const teamCheckedInTodayCount = workload.filter((w) => w.attendanceStatus === "checked_in").length;
  const activeTimersCount = workload.filter((w) => w.hasActiveTimer).length;
  const activeAssignmentsCount = workload.reduce((sum, w) => sum + w.activeAssignmentsCount, 0);
  const overdueAssignmentsCount = workload.reduce((sum, w) => sum + w.overdueCount, 0);

  const overview: TeamPerformanceOverview = {
    completedDeliverablesCount,
    completedConceptsCount: completedConceptIds.size,
    totalAssignmentsCount: scoped.assignments.length,
    onTimeDeliveryRate: onTimeEligibleCount > 0 ? Math.round((onTimeDeliveredCount / onTimeEligibleCount) * 1000) / 10 : null,
    onTimeEligibleCount,
    onTimeDeliveredCount,
    avgDelayHoursOnLateDeliveries: lateDeliveriesCount > 0 ? Math.round((totalDelayHoursOnLate / lateDeliveriesCount) * 10) / 10 : null,
    firstPassApprovalRate: firstPassEligibleCount > 0 ? Math.round((firstPassApprovedCount / firstPassEligibleCount) * 1000) / 10 : null,
    firstPassEligibleCount,
    firstPassApprovedCount,
    avgRevisionRounds: revisionEligibleAssignments > 0 ? Math.round((totalRevisionCyclesCount / revisionEligibleAssignments) * 10) / 10 : null,
    totalRevisionCyclesCount,
    totalTrackedSeconds,
    avgProductionTimeSeconds: productionTimeEligibleDeliverables > 0 ? Math.round(productionTimeTotalSeconds / productionTimeEligibleDeliverables) : null,
    activeAssignmentsCount,
    overdueAssignmentsCount,
    activeTimersCount,
    teamCheckedInTodayCount,
    totalTeamMembersCount,
  };

  return {
    status: 200,
    data: {
      overview,
      scorecards,
      workload,
    },
  };
}

export function getDesignerPerformanceDetail(
  state: AppState,
  targetUserId: string,
  actorUserId: string,
  actorRole: UserRole,
  filters?: PerformanceFilters
): { status: number; error?: string; data?: DesignerPerformanceDetail } {
  const targetUser = state.users.find((u) => u.id === targetUserId);
  if (!targetUser) {
    return { status: 404, error: "Designer not found." };
  }

  const auth = validatePerformanceAccess(state, actorUserId, actorRole, filters?.projectId);
  if (!auth.authorized || !auth.authorizedProjectIds) {
    return { status: 403, error: auth.error || "Access Denied." };
  }

  const scoped = filterStateToScope(state, auth.authorizedProjectIds, filters);

  const designerAssignments = scoped.assignments.filter((a) => a.assigneeUserId === targetUserId);
  const primaryAssignments = designerAssignments.filter(
    (a) => a.assignmentRole === "designer" || a.assignmentRole === "video_editor"
  );
  const designerSessions = scoped.workSessions.filter((ws) =>
    designerAssignments.some((a) => a.id === ws.assignmentId)
  );

  let completedDeliverablesCount = 0;
  const completedConceptIds = new Set<string>();
  const timeByContentType: Record<string, number> = {};
  const outputByPlatform: Record<string, number> = {};
  const outputByProject: Record<string, { deliverables: number; seconds: number }> = {};

  let onTimeDeliveriesCount = 0;
  let lateDeliveriesCount = 0;
  let eligibleSubmissionsCount = 0;
  let totalDelayHoursOnLate = 0;
  const deliveryHistory: DesignerPerformanceDetail["delivery"]["history"] = [];

  let firstPassApprovedCount = 0;
  let firstPassEligibleCount = 0;
  let totalChangeRequestsReceived = 0;
  const revisionsByComponent = { copy: 0, creative: 0, posting_date: 0 };

  let completedPrimaryWithTime = 0;
  let primaryProductionSeconds = 0;

  for (const a of primaryAssignments) {
    const item = scoped.contentItems.find((i) => i.id === a.contentItemId);
    const proj = scoped.projects.find((p) => p.id === a.projectId);
    const isComp = isAssignmentCompleted(a, item);

    if (item) {
      // Platform & project aggregations
      if (!outputByPlatform[item.platform]) outputByPlatform[item.platform] = 0;
      if (!outputByProject[item.projectId]) {
        outputByProject[item.projectId] = { deliverables: 0, seconds: 0 };
      }
    }

    if (isComp && item) {
      completedDeliverablesCount++;
      outputByPlatform[item.platform]++;
      outputByProject[item.projectId].deliverables++;

      if (item.contentGroupId) {
        completedConceptIds.add(item.contentGroupId);
      } else {
        completedConceptIds.add(`standalone_${item.id}`);
      }

      const itemSessions = designerSessions.filter((ws) => ws.assignmentId === a.id);
      const sec = calculateEffectiveProductionSeconds(itemSessions);
      if (sec > 0) {
        completedPrimaryWithTime++;
        primaryProductionSeconds += sec;
        timeByContentType[item.contentType] = (timeByContentType[item.contentType] || 0) + sec;
        outputByProject[item.projectId].seconds += sec;
      }
    }

    // Delivery reliability
    const { firstSubmittedAt } = getFirstFormalSubmission(a, scoped.submissionVersions);
    if (firstSubmittedAt && item) {
      const effectiveDue = getEffectiveDueAtSubmissionTime(a, firstSubmittedAt);
      if (effectiveDue) {
        eligibleSubmissionsCount++;
        const isOnTime = new Date(firstSubmittedAt).getTime() <= new Date(effectiveDue).getTime();

        let delayHours: number | undefined;
        if (isOnTime) {
          onTimeDeliveriesCount++;
        } else {
          lateDeliveriesCount++;
          const delayMs = new Date(firstSubmittedAt).getTime() - new Date(effectiveDue).getTime();
          delayHours = Math.round((delayMs / 3600000) * 10) / 10;
          totalDelayHoursOnLate += delayHours;
        }

        deliveryHistory.push({
          contentItemId: item.id,
          title: item.title,
          platform: item.platform,
          projectName: proj?.name || "Project",
          firstSubmittedAt,
          effectiveDueAt: effectiveDue,
          isOnTime,
          delayHours,
        });
      }
    }

    // Review efficiency
    if (item) {
      const fp = evaluateFirstPassApproval(item, scoped.submissionVersions, state.approvalDecisions, scoped.changeRequests);
      if (fp !== null) {
        firstPassEligibleCount++;
        if (fp === true) firstPassApprovedCount++;
      }

      const crs = scoped.changeRequests.filter((cr) => cr.contentItemId === item.id);
      totalChangeRequestsReceived += crs.length;
      for (const cr of crs) {
        if (cr.component === "copy") revisionsByComponent.copy++;
        else if (cr.component === "creative") revisionsByComponent.creative++;
        else if (cr.component === "posting_date") revisionsByComponent.posting_date++;
      }
    }
  }

  // Workload counts
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);

  const activeAssignments = designerAssignments.filter(
    (a) => a.status === "assigned" || a.status === "accepted" || a.status === "in_progress"
  );
  let dueTodayCount = 0;
  let dueThisWeekCount = 0;
  let overdueCount = 0;

  for (const a of activeAssignments) {
    if (a.currentDueAt) {
      const dueDate = new Date(a.currentDueAt);
      if (dueDate.getTime() < now.getTime()) overdueCount++;
      else {
        if (a.currentDueAt.startsWith(todayStr)) dueTodayCount++;
        if (dueDate.getTime() <= weekFromNow.getTime()) dueThisWeekCount++;
      }
    }
  }

  // Weekly output trends
  const weeklyCompletedMap: Record<string, { count: number; seconds: number }> = {};
  for (const a of primaryAssignments) {
    const item = scoped.contentItems.find((i) => i.id === a.contentItemId);
    if (isAssignmentCompleted(a, item) && a.completedAt) {
      const d = new Date(a.completedAt);
      const weekLabel = `Wk ${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString([], { month: "short" })}`;
      if (!weeklyCompletedMap[weekLabel]) weeklyCompletedMap[weekLabel] = { count: 0, seconds: 0 };
      weeklyCompletedMap[weekLabel].count++;
      const sec = calculateEffectiveProductionSeconds(designerSessions.filter((ws) => ws.assignmentId === a.id));
      weeklyCompletedMap[weekLabel].seconds += sec;
    }
  }

  const weeklyCompleted = Object.entries(weeklyCompletedMap).map(([weekLabel, val]) => ({
    weekLabel,
    count: val.count,
    trackedSeconds: val.seconds,
  }));

  // Attendance Context
  const todayAttendance = state.attendanceRecords.find(
    (ar) => ar.userId === targetUserId && ar.attendanceDate === todayStr
  );
  const userAttendanceRecords = state.attendanceRecords.filter((ar) => ar.userId === targetUserId);
  const todaySessions = state.workSessions.filter(
    (ws) => ws.userId === targetUserId && ws.startedAt.startsWith(todayStr)
  );

  return {
    status: 200,
    data: {
      user: targetUser,
      productivity: {
        completedDeliverablesCount,
        completedConceptsCount: completedConceptIds.size,
        totalTrackedSeconds: calculateEffectiveProductionSeconds(designerSessions),
        avgProductionTimeSeconds: completedPrimaryWithTime > 0 ? Math.round(primaryProductionSeconds / completedPrimaryWithTime) : null,
        timeByContentType,
        outputByPlatform,
        outputByProject,
        activeAssignmentsCount: activeAssignments.length,
        completedAssignmentsCount: primaryAssignments.filter((a) => a.status === "completed").length,
      },
      delivery: {
        onTimeDeliveryRate: eligibleSubmissionsCount > 0 ? Math.round((onTimeDeliveriesCount / eligibleSubmissionsCount) * 1000) / 10 : null,
        onTimeDeliveriesCount,
        lateDeliveriesCount,
        eligibleSubmissionsCount,
        avgDelayHoursOnLate: lateDeliveriesCount > 0 ? Math.round((totalDelayHoursOnLate / lateDeliveriesCount) * 10) / 10 : null,
        dueTodayCount,
        dueThisWeekCount,
        overdueCount,
        history: deliveryHistory,
      },
      reviewEfficiency: {
        firstPassApprovalRate: firstPassEligibleCount > 0 ? Math.round((firstPassApprovedCount / firstPassEligibleCount) * 1000) / 10 : null,
        firstPassApprovedCount,
        firstPassEligibleCount,
        avgRevisionRounds: completedDeliverablesCount > 0 ? Math.round((totalChangeRequestsReceived / completedDeliverablesCount) * 10) / 10 : null,
        totalChangeRequestsReceived,
        revisionsByComponent,
      },
      trends: {
        weeklyCompleted,
        contentTypeDistribution: outputByPlatform,
        platformDistribution: outputByPlatform,
        projectDistribution: Object.fromEntries(Object.entries(outputByProject).map(([k, v]) => [k, v.deliverables])),
      },
      attendanceContext: {
        daysPresentInRange: userAttendanceRecords.length,
        isCheckedInToday: !!todayAttendance && !todayAttendance.checkedOutAt,
        todayCheckInTime: todayAttendance?.checkedInAt,
        todayCheckOutTime: todayAttendance?.checkedOutAt,
        totalTrackedTodaySeconds: calculateEffectiveProductionSeconds(todaySessions),
      },
    },
  };
}
