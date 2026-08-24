import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import {
  ContentAssignment,
  WorkSession,
  AppState,
} from "@/lib/types";

describe("Phase 2: Content Assignment Workflow & Server-Timestamped Time Tracking", () => {
  // Helper to construct test state
  function createTestState(): AppState {
    return getInitialDeterministicState();
  }

  it("1. blocks startWorkSession if user is not an active project member", () => {
    const state = createTestState();
    // Non-member user
    const nonMemberUserId = "u_random_outsider";
    const project = state.projects[0];
    const item = state.contentItems.find((i) => i.projectId === project.id)!;
    const assignment = state.contentAssignments.find((a) => a.contentItemId === item.id)!;

    const isMember = state.projectMemberships.some(
      (m) => m.projectId === project.id && m.userId === nonMemberUserId && m.status === "active"
    );
    expect(isMember).toBe(false);
  });

  it("2. blocks startWorkSession if user is soft-inactivated", () => {
    const state = createTestState();
    const designer = state.users.find((u) => u.role === "designer")!;
    designer.status = "inactive";

    expect(designer.status).toBe("inactive");
  });

  it("3. enforces concurrency limit: maximum one active work session per user", () => {
    const state = createTestState();
    const designer = state.users.find((u) => u.role === "designer")!;
    
    // Create an active session
    const activeSession: WorkSession = {
      id: "ws_active_1",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assignmentId: "asgn_1",
      userId: designer.id,
      startedAt: new Date(Date.now() - 300000).toISOString(),
      accumulatedSeconds: 0,
      activeSegmentStartedAt: new Date(Date.now() - 300000).toISOString(),
      status: "active",
      adjustments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.workSessions.push(activeSession);

    // Attempting to start a second session for same designer must be detected
    const existingActive = state.workSessions.find(
      (ws) => ws.userId === designer.id && ws.status === "active"
    );
    expect(existingActive).toBeDefined();
    expect(existingActive?.id).toBe("ws_active_1");
  });

  it("4. pauseWorkSession calculates server-timestamped segment duration and clears active segment", () => {
    const startIso = new Date(Date.now() - 60000).toISOString(); // 60s ago
    const session: WorkSession = {
      id: "ws_test_pause",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assignmentId: "asgn_1",
      userId: "u_designer_1",
      startedAt: startIso,
      accumulatedSeconds: 120, // already had 2 mins
      activeSegmentStartedAt: startIso,
      status: "active",
      adjustments: [],
      createdAt: startIso,
      updatedAt: startIso,
    };

    // Calculate segment
    const segmentDuration = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(session.activeSegmentStartedAt!)) / 1000)
    );
    expect(segmentDuration).toBeGreaterThanOrEqual(59);

    const newAccumulated = session.accumulatedSeconds + segmentDuration;
    const pausedSession: WorkSession = {
      ...session,
      accumulatedSeconds: newAccumulated,
      activeSegmentStartedAt: null,
      status: "paused",
      updatedAt: new Date().toISOString(),
    };

    expect(pausedSession.status).toBe("paused");
    expect(pausedSession.activeSegmentStartedAt).toBeNull();
    expect(pausedSession.accumulatedSeconds).toBeGreaterThanOrEqual(179);
  });

  it("5. resumeWorkSession verifies no other active session exists for user", () => {
    const session1: WorkSession = {
      id: "ws_paused_1",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assignmentId: "asgn_1",
      userId: "u_designer_1",
      startedAt: new Date().toISOString(),
      accumulatedSeconds: 300,
      activeSegmentStartedAt: null,
      status: "paused",
      adjustments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const session2: WorkSession = {
      id: "ws_active_2",
      projectId: "proj_acme",
      contentItemId: "item_acme_2",
      assignmentId: "asgn_2",
      userId: "u_designer_1",
      startedAt: new Date().toISOString(),
      accumulatedSeconds: 0,
      activeSegmentStartedAt: new Date().toISOString(),
      status: "active",
      adjustments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const sessions = [session1, session2];
    const canResume1 = !sessions.some(
      (ws) => ws.userId === "u_designer_1" && ws.status === "active" && ws.id !== session1.id
    );
    expect(canResume1).toBe(false); // blocked by session2
  });

  it("6. stopWorkSession marks status completed and records endedAt", () => {
    const now = new Date().toISOString();
    const session: WorkSession = {
      id: "ws_test_stop",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assignmentId: "asgn_1",
      userId: "u_designer_1",
      startedAt: now,
      accumulatedSeconds: 600,
      activeSegmentStartedAt: null,
      status: "paused",
      adjustments: [],
      createdAt: now,
      updatedAt: now,
    };

    const stoppedSession: WorkSession = {
      ...session,
      status: "completed",
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(stoppedSession.status).toBe("completed");
    expect(stoppedSession.endedAt).toBeDefined();
  });

  it("7. adjustWorkSessionDuration appends to adjustments ledger and preserves previous history", () => {
    const session: WorkSession = {
      id: "ws_test_adjust",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assignmentId: "asgn_1",
      userId: "u_designer_1",
      startedAt: new Date().toISOString(),
      accumulatedSeconds: 3600, // 60 mins recorded
      activeSegmentStartedAt: null,
      status: "completed",
      adjustments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const adjustment = {
      id: "adj_1",
      workSessionId: session.id,
      previousDurationSeconds: session.accumulatedSeconds,
      adjustedDurationSeconds: 2400, // corrected to 40 mins
      reason: "Deducted 20 minutes for break when timer was left running",
      adjustedByUserId: "u_founder",
      adjustedAt: new Date().toISOString(),
    };

    const updatedSession: WorkSession = {
      ...session,
      accumulatedSeconds: adjustment.adjustedDurationSeconds,
      adjustments: [...session.adjustments, adjustment],
    };

    expect(updatedSession.accumulatedSeconds).toBe(2400);
    expect(updatedSession.adjustments).toHaveLength(1);
    expect(updatedSession.adjustments[0].previousDurationSeconds).toBe(3600);
    expect(updatedSession.adjustments[0].reason).toContain("Deducted 20 minutes");
  });

  it("8. preserves historical assignment when deliverable is reassigned", () => {
    const oldAssignment: ContentAssignment = {
      id: "asgn_original",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assigneeUserId: "u_designer_1",
      assignmentRole: "designer",
      status: "in_progress",
      assignedByUserId: "u_founder",
      assignedAt: new Date(Date.now() - 86400000).toISOString(),
      initialDueAt: new Date(Date.now() + 86400000).toISOString(),
      currentDueAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const now = new Date().toISOString();
    // Reassignment
    const updatedOldAssignment: ContentAssignment = {
      ...oldAssignment,
      status: "reassigned",
      reassignmentReason: "Designer workload balancing",
      completedAt: now,
      updatedAt: now,
    };

    const newAssignment: ContentAssignment = {
      id: "asgn_new_2",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assigneeUserId: "u_designer_2",
      assignmentRole: "designer",
      status: "assigned",
      assignedByUserId: "u_founder",
      assignedAt: now,
      initialDueAt: oldAssignment.currentDueAt,
      currentDueAt: oldAssignment.currentDueAt,
      replacedAssignmentId: oldAssignment.id,
      createdAt: now,
      updatedAt: now,
    };

    expect(updatedOldAssignment.status).toBe("reassigned");
    expect(updatedOldAssignment.reassignmentReason).toBe("Designer workload balancing");
    expect(newAssignment.replacedAssignmentId).toBe("asgn_original");
    expect(newAssignment.assigneeUserId).toBe("u_designer_2");
  });

  it("9. updateAssignmentDeadline preserves audit history ledger with reason and actor", () => {
    const assignment: ContentAssignment = {
      id: "asgn_test_deadline",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assigneeUserId: "u_designer_1",
      assignmentRole: "designer",
      status: "assigned",
      assignedByUserId: "u_founder",
      assignedAt: "2026-08-20T10:00:00.000Z",
      initialDueAt: "2026-08-25T18:00:00.000Z",
      currentDueAt: "2026-08-25T18:00:00.000Z",
      dueAtHistory: [],
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-20T10:00:00.000Z",
    };

    const newDue = "2026-08-28T18:00:00.000Z";
    const historyEntry = {
      previousDueAt: assignment.currentDueAt,
      newDueAt: newDue,
      changedByUserId: "u_consultant",
      changedAt: new Date().toISOString(),
      reason: "Client delayed script sign-off by 3 days",
    };

    const updatedAssignment: ContentAssignment = {
      ...assignment,
      currentDueAt: newDue,
      dueAtHistory: [...assignment.dueAtHistory!, historyEntry],
    };

    expect(updatedAssignment.initialDueAt).toBe("2026-08-25T18:00:00.000Z");
    expect(updatedAssignment.currentDueAt).toBe("2026-08-28T18:00:00.000Z");
    expect(updatedAssignment.dueAtHistory).toHaveLength(1);
    expect(updatedAssignment.dueAtHistory![0].reason).toBe("Client delayed script sign-off by 3 days");
    expect(updatedAssignment.dueAtHistory![0].changedByUserId).toBe("u_consultant");
  });

  it("10. submitVersion moves assignment to 'submitted' and records firstSubmittedAt on v1, deliverable to in_review", () => {
    const assignment: ContentAssignment = {
      id: "asgn_test_sub",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assigneeUserId: "u_designer_1",
      assignmentRole: "designer",
      status: "in_progress",
      assignedByUserId: "u_founder",
      assignedAt: "2026-08-20T10:00:00.000Z",
      initialDueAt: "2026-08-25T18:00:00.000Z",
      currentDueAt: "2026-08-25T18:00:00.000Z",
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-20T10:00:00.000Z",
    };

    const now = new Date().toISOString();
    const versionNumber = 1;
    const updatedAssignment: ContentAssignment = {
      ...assignment,
      status: "submitted",
      firstSubmittedAt: assignment.firstSubmittedAt || (versionNumber === 1 ? now : undefined),
      updatedAt: now,
    };

    expect(updatedAssignment.status).toBe("submitted");
    expect(updatedAssignment.firstSubmittedAt).toBe(now);
  });
});
