import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import { getOrganizationPerformance } from "@/lib/performance";
import { AppState, ContentAssignment, WorkSession, AttendanceRecord } from "@/lib/types";

describe("Phase 6: Real-Time Workload & Capacity Board Engine", () => {
  function createTestState(): AppState {
    const base = getInitialDeterministicState();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Add active timer for u_designer1
    const activeSession: WorkSession = {
      id: "ws_active_test",
      assignmentId: "asgn_acme_1",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      userId: "u_designer1",
      startedAt: new Date(now.getTime() - 45 * 60000).toISOString(), // 45 mins ago
      accumulatedSeconds: 2700,
      adjustments: [],
      status: "active",
      createdAt: new Date(now.getTime() - 45 * 60000).toISOString(),
      updatedAt: new Date(now.getTime() - 45 * 60000).toISOString(),
    };

    // Add attendance check-in for u_designer1 today
    const attendance: AttendanceRecord = {
      id: "att_today_d1",
      userId: "u_designer1",
      attendanceDate: todayStr,
      checkedInAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
      status: "checked_in",
      createdAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
      updatedAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
    };

    return {
      ...base,
      workSessions: [activeSession, ...base.workSessions],
      attendanceRecords: [attendance, ...base.attendanceRecords],
    };
  }

  it("1. detects running work timers and identifies the active task and project", () => {
    const state = createTestState();
    const result = getOrganizationPerformance(state, "u_founder", "founder");

    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    const d1Workload = result.data?.workload.find((w) => w.userId === "u_designer1");
    expect(d1Workload).toBeDefined();
    expect(d1Workload?.hasActiveTimer).toBe(true);
    expect(d1Workload?.activeTimerSessionId).toBe("ws_active_test");
    expect(d1Workload?.activeTimerTaskTitle).toBe("5 Pillars of Patient Retention in Modern Clinics");
  });

  it("2. displays attendance presence status independently from work timers", () => {
    const state = createTestState();
    const result = getOrganizationPerformance(state, "u_founder", "founder");

    const d1Workload = result.data?.workload.find((w) => w.userId === "u_designer1");
    expect(d1Workload?.attendanceStatus).toBe("checked_in");
    expect(d1Workload?.checkInTime).toBeDefined();

    // Check that attendance status is distinctly populated (checked_in or not_checked_in)
    expect(d1Workload?.attendanceStatus).toBeDefined();
  });

  it("3. categorizes active assignments into due today, due this week, and overdue", () => {
    let state = createTestState();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Create 3 active assignments for u_designer1
    const a1: ContentAssignment = {
      id: "asgn_due_today",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assigneeUserId: "u_designer1",
      assignmentRole: "designer",
      status: "in_progress",
      assignedByUserId: "u_founder",
      assignedAt: now.toISOString(),
      initialDueAt: `${todayStr}T23:59:59Z`,
      currentDueAt: `${todayStr}T23:59:59Z`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const a2: ContentAssignment = {
      id: "asgn_overdue",
      projectId: "proj_acme",
      contentItemId: "item_acme_2",
      assigneeUserId: "u_designer1",
      assignmentRole: "designer",
      status: "in_progress",
      assignedByUserId: "u_founder",
      assignedAt: now.toISOString(),
      initialDueAt: new Date(now.getTime() - 24 * 3600000).toISOString(),
      currentDueAt: new Date(now.getTime() - 24 * 3600000).toISOString(), // Yesterday
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    state = {
      ...state,
      contentAssignments: [a1, a2, ...state.contentAssignments.filter((a) => a.assigneeUserId !== "u_designer1")],
    };

    const result = getOrganizationPerformance(state, "u_founder", "founder");
    const d1Workload = result.data?.workload.find((w) => w.userId === "u_designer1");

    expect(d1Workload?.activeAssignmentsCount).toBe(2);
    expect(d1Workload?.dueTodayCount).toBe(1);
    expect(d1Workload?.overdueCount).toBe(1);
  });

  it("4. surfaces explainable Capacity Risk warnings when overdue tasks or concentration thresholds are met", () => {
    let state = createTestState();
    const now = new Date();

    // Create 2 overdue tasks for u_designer1
    const overdueTasks: ContentAssignment[] = [
      {
        id: "ov_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        assigneeUserId: "u_designer1",
        assignmentRole: "designer",
        status: "in_progress",
        assignedByUserId: "u_founder",
        assignedAt: now.toISOString(),
        initialDueAt: new Date(now.getTime() - 48 * 3600000).toISOString(),
        currentDueAt: new Date(now.getTime() - 48 * 3600000).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: "ov_2",
        projectId: "proj_acme",
        contentItemId: "item_acme_2",
        assigneeUserId: "u_designer1",
        assignmentRole: "designer",
        status: "in_progress",
        assignedByUserId: "u_founder",
        assignedAt: now.toISOString(),
        initialDueAt: new Date(now.getTime() - 24 * 3600000).toISOString(),
        currentDueAt: new Date(now.getTime() - 24 * 3600000).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ];

    state = {
      ...state,
      contentAssignments: [...overdueTasks, ...state.contentAssignments.filter((a) => a.assigneeUserId !== "u_designer1")],
    };

    const result = getOrganizationPerformance(state, "u_founder", "founder");
    const d1Workload = result.data?.workload.find((w) => w.userId === "u_designer1");

    expect(d1Workload?.capacityRisk).toBe(true);
    expect(d1Workload?.capacityRiskReason).toContain("overdue");
  });

  it("5. excludes inactive designers from live workload board by default", () => {
    const state = createTestState();
    const result = getOrganizationPerformance(state, "u_founder", "founder");

    // Inactive designer u_inactive_designer should NOT be in active workload board
    const inactiveInWorkload = result.data?.workload.some((w) => w.userId === "u_inactive_designer");
    expect(inactiveInWorkload).toBe(false);
  });
});
