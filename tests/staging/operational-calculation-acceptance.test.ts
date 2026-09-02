import { describe, it, expect } from "vitest";
import {
  getPeriodDateRange,
  calculateInternalDeadline,
  calculateEmployeePeriodCapacity,
  calculateEmployeeScorecard,
  calculateTeamPerformanceOverview,
  calculateProjectPerformance,
  calculateEffortAnalysis,
  getCapacityStatus,
} from "../../lib/calculations/operationalEngine";
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
} from "../../lib/types";

describe("Operational Calculation Engine Acceptance Suite", () => {
  const mockOrgId = "org_test_123";

  const sampleStandards: EffortStandard[] = [
    {
      id: "std_1",
      orgId: mockOrgId,
      category: "Static",
      workType: "Simple Static Poster",
      contentSeconds: 1800, // 0.5h
      productionSeconds: 3600, // 1.0h
      totalSeconds: 5400, // 1.5h
      leadTimeWorkdays: 1,
      defaultRole: "Designer",
      active: true,
      version: 1,
      effectiveFrom: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "std_2",
      orgId: mockOrgId,
      category: "Video",
      workType: "Short-form Reel",
      contentSeconds: 2700, // 0.75h
      productionSeconds: 10800, // 3.0h
      totalSeconds: 13500, // 3.75h
      leadTimeWorkdays: 2,
      defaultRole: "Video Editor",
      active: true,
      version: 1,
      effectiveFrom: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "std_3",
      orgId: mockOrgId,
      category: "Carousel",
      workType: "Simple Carousel",
      contentSeconds: 2700, // 0.75h
      productionSeconds: 9000, // 2.5h
      totalSeconds: 11700, // 3.25h
      leadTimeWorkdays: 2,
      defaultRole: "Designer",
      active: true,
      version: 1,
      effectiveFrom: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const user1: User = {
    id: "usr_irfan",
    name: "Irfan Creative",
    email: "irfan@aceassured.com",
    avatar: "IC",
    role: "designer",
    status: "active",
    dateJoined: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const user2: User = {
    id: "usr_ramesh",
    name: "Ramesh Lead",
    email: "ramesh@aceassured.com",
    avatar: "RL",
    role: "designer",
    status: "active",
    dateJoined: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const project1: Project = {
    id: "proj_health",
    name: "Acme Healthcare",
    clientBrand: "Acme Health",
    avatar: "AH",
    scope: "Social Retainer",
    timezone: "Asia/Kolkata",
    status: "active",
    targetRequirements: { posts: 0, carousels: 0, reels: 0, trialReels: 0 },
    workflowStages: ["draft", "in_review", "approved", "published"],
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("calculates working days lead time for internal deadline correctly", () => {
    // Friday posting date with 2 workdays lead time -> internal deadline should be Wednesday
    const friday = new Date("2026-09-04T12:00:00Z"); // Friday
    const deadline = calculateInternalDeadline(friday, 2);
    expect(deadline.getUTCDay()).toBe(3); // Wednesday (skipping nothing within the week)

    // Monday posting date with 2 workdays lead time -> skips Saturday and Sunday, lands on Thursday
    const monday = new Date("2026-09-07T12:00:00Z"); // Monday
    const leadDeadline = calculateInternalDeadline(monday, 2);
    expect(leadDeadline.getUTCDay()).toBe(4); // Thursday of previous week
  });

  it("calculates date-aware employee capacity with leave adjustments", () => {
    const schedules: EmployeeCapacitySchedule[] = [
      {
        id: "sch_1",
        orgId: mockOrgId,
        userId: user1.id,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        mondayHours: 8,
        tuesdayHours: 8,
        wednesdayHours: 8,
        thursdayHours: 8,
        fridayHours: 8,
        saturdayHours: 0,
        sundayHours: 0,
        primaryFunction: "Creative",
        creativeEligibility: "primary",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const adjustments: CapacityAdjustment[] = [
      {
        id: "adj_1",
        orgId: mockOrgId,
        userId: user1.id,
        adjustmentDate: "2026-09-01", // Tuesday leave
        kind: "leave",
        adjustmentHours: -8,
        reason: "Personal Leave",
        createdAt: "2026-09-01T00:00:00Z",
      },
    ];

    // Week: Mon Aug 31 - Sun Sep 06 (5 working days = 40h base - 8h leave = 32h final capacity)
    const cap = calculateEmployeePeriodCapacity(user1.id, "2026-08-31", "2026-09-06", schedules, adjustments);
    expect(cap.baseCapacityHours).toBe(40);
    expect(cap.adjustmentHours).toBe(-8);
    expect(cap.finalCapacityHours).toBe(32);
    expect(cap.creativeEligibility).toBe("primary");
  });

  it("computes planned allocation %, utilization %, and unclamped remaining capacity", () => {
    const period = { startDate: "2026-09-01", endDate: "2026-09-30", label: "September 2026" };

    const schedules: EmployeeCapacitySchedule[] = [
      {
        id: "sch_1",
        orgId: mockOrgId,
        userId: user1.id,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        mondayHours: 8,
        tuesdayHours: 8,
        wednesdayHours: 8,
        thursdayHours: 8,
        fridayHours: 8,
        saturdayHours: 0,
        sundayHours: 0,
        primaryFunction: "Creative",
        creativeEligibility: "primary",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    // 22 working days in Sep 2026 = 176h capacity
    // Assign 10 Short-form Reels (3.75h each = 37.5h) + 10 Simple Posters (1.5h each = 15h) = 52.5h
    const items: ContentItem[] = [
      {
        id: "item_1",
        projectId: project1.id,
        title: "Reel 1",
        platform: "Instagram",
        contentType: "reel",
        workType: "Short-form Reel",
        stage: "draft",
        accountableOwnerId: user1.id,
        collaboratorIds: [],
        deadlines: { scheduledPublicationDate: "2026-09-10T10:00:00Z" },
        finalPlannedSeconds: 13500, // 3.75h
        currentVersionNumber: 1,
        scopeClassification: "contracted",
      },
      {
        id: "item_2",
        projectId: project1.id,
        title: "Poster 1",
        platform: "Instagram",
        contentType: "post",
        workType: "Simple Static Poster",
        stage: "approved",
        completedAt: "2026-09-08T15:00:00Z",
        finalInternalDeadline: "2026-09-09T18:00:00Z",
        accountableOwnerId: user1.id,
        collaboratorIds: [],
        deadlines: { scheduledPublicationDate: "2026-09-10T10:00:00Z" },
        finalPlannedSeconds: 5400, // 1.5h
        currentVersionNumber: 1,
        scopeClassification: "contracted",
      },
    ];

    const assignments: ContentAssignment[] = [
      {
        id: "asgn_1",
        projectId: project1.id,
        contentItemId: "item_1",
        assigneeUserId: user1.id,
        assignmentRole: "designer",
        status: "assigned",
        assignedByUserId: "usr_admin",
        assignedAt: "2026-09-01T00:00:00Z",
        initialDueAt: "2026-09-10T00:00:00Z",
        currentDueAt: "2026-09-10T00:00:00Z",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "asgn_2",
        projectId: project1.id,
        contentItemId: "item_2",
        assigneeUserId: user1.id,
        assignmentRole: "designer",
        status: "completed",
        assignedByUserId: "usr_admin",
        assignedAt: "2026-09-01T00:00:00Z",
        initialDueAt: "2026-09-09T00:00:00Z",
        currentDueAt: "2026-09-09T00:00:00Z",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ];

    const workSessions: WorkSession[] = [
      {
        id: "sess_1",
        projectId: project1.id,
        contentItemId: "item_2",
        assignmentId: "asgn_2",
        userId: user1.id,
        startedAt: "2026-09-08T10:00:00Z",
        endedAt: "2026-09-08T11:00:00Z",
        accumulatedSeconds: 3600, // 1.0h actual logged
        status: "completed",
        adjustments: [],
        createdAt: "2026-09-08T10:00:00Z",
        updatedAt: "2026-09-08T11:00:00Z",
      },
    ];

    const scorecard = calculateEmployeeScorecard(
      user1,
      period,
      items,
      assignments,
      workSessions,
      [],
      schedules,
      []
    );

    expect(scorecard.assignedPlannedHours).toBe(5.25);
    expect(scorecard.actualLoggedHours).toBe(1);
    expect(scorecard.remainingPlannedHours).toBe(scorecard.capacity.finalCapacityHours - 5.25);
    expect(scorecard.completedTasksCount).toBe(1);
    expect(scorecard.onTimeDeliveredCount).toBe(1);
    expect(scorecard.onTimePercent).toBe(100);
    // Efficiency: Planned 1.5h / Actual 1.0h = 150%
    expect(scorecard.efficiencyPercent).toBe(150);
  });

  it("tracks contractual commitment quotas exclusively from contracted items", () => {
    const period = { startDate: "2026-09-01", endDate: "2026-09-30", label: "September 2026" };

    const commitments: ProjectCommitment[] = [
      {
        id: "com_1",
        orgId: mockOrgId,
        projectId: project1.id,
        workTypeName: "Short-form Reel",
        committedQuantity: 4,
        effectiveMonth: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ];

    const items: ContentItem[] = [
      // 2 Contracted completed reels
      {
        id: "c_reel_1",
        projectId: project1.id,
        title: "Reel 1",
        platform: "Instagram",
        contentType: "reel",
        workType: "Short-form Reel",
        stage: "published",
        completedAt: "2026-09-05T00:00:00Z",
        accountableOwnerId: user1.id,
        collaboratorIds: [],
        deadlines: { scheduledPublicationDate: "2026-09-05T00:00:00Z" },
        currentVersionNumber: 1,
        scopeClassification: "contracted",
      },
      {
        id: "c_reel_2",
        projectId: project1.id,
        title: "Reel 2",
        platform: "Instagram",
        contentType: "reel",
        workType: "Short-form Reel",
        stage: "published",
        completedAt: "2026-09-10T00:00:00Z",
        accountableOwnerId: user1.id,
        collaboratorIds: [],
        deadlines: { scheduledPublicationDate: "2026-09-10T00:00:00Z" },
        currentVersionNumber: 1,
        scopeClassification: "contracted",
      },
      // 1 Goodwill reel (Value-add) -> MUST NOT count toward quota
      {
        id: "gw_reel_1",
        projectId: project1.id,
        title: "Bonus Reel",
        platform: "Instagram",
        contentType: "reel",
        workType: "Short-form Reel",
        stage: "published",
        completedAt: "2026-09-15T00:00:00Z",
        accountableOwnerId: user1.id,
        collaboratorIds: [],
        deadlines: { scheduledPublicationDate: "2026-09-15T00:00:00Z" },
        currentVersionNumber: 1,
        scopeClassification: "goodwill",
      },
    ];

    const perf = calculateProjectPerformance(project1, period, items, [], commitments, []);

    expect(perf.commitments[0].workTypeName).toBe("Short-form Reel");
    expect(perf.commitments[0].committedQuantity).toBe(4);
    expect(perf.commitments[0].fulfilledContractedQuantity).toBe(2); // Only contracted 2 count
    expect(perf.commitments[0].percent).toBe(50); // 2/4 = 50%
  });

  it("calculates advertising performance KPIs dynamically", () => {
    const period = { startDate: "2026-09-01", endDate: "2026-09-30", label: "September 2026" };

    const perfInputs: ProjectPerformanceInput[] = [
      {
        id: "ad_1",
        orgId: mockOrgId,
        projectId: project1.id,
        effectiveMonth: "2026-09-01",
        currency: "INR",
        adBudget: 50000,
        adSpend: 40000,
        leads: 200,
        conversions: 20,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ];

    const perf = calculateProjectPerformance(project1, period, [], [], [], perfInputs);

    expect(perf.advertising).toBeDefined();
    expect(perf.advertising?.adSpend).toBe(40000);
    expect(perf.advertising?.leads).toBe(200);
    // CPL = 40000 / 200 = 200
    expect(perf.advertising?.cpl).toBe(200);
    // Conv Rate = (20 / 200) * 100 = 10%
    expect(perf.advertising?.conversionRate).toBe(10);
    // Cost per Conv = 40000 / 20 = 2000
    expect(perf.advertising?.costPerConversion).toBe(2000);
  });
});
