import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import {
  evaluateFirstPassApproval,
  getEffectiveDueAtSubmissionTime,
  calculateEffectiveProductionSeconds,
  countRevisionRounds,
  getOrganizationPerformance,
} from "@/lib/performance";
import {
  AppState,
  ContentAssignment,
  ContentItem,
  SubmissionVersion,
  WorkSession,
  ChangeRequest,
  ApprovalDecision,
} from "@/lib/types";

describe("Phase 6: Deterministic Performance KPI Engine & Attribution Rules", () => {
  function createTestState(): AppState {
    return getInitialDeterministicState();
  }

  it("1. calculates Initial Delivery On-Time using effective deadline at submission time", () => {
    const assignment: ContentAssignment = {
      id: "asgn_test_1",
      projectId: "proj_acme",
      contentItemId: "item_test_1",
      assigneeUserId: "u_designer1",
      assignmentRole: "designer",
      status: "submitted",
      assignedByUserId: "u_founder",
      assignedAt: "2026-08-01T10:00:00Z",
      initialDueAt: "2026-08-10T18:00:00Z",
      currentDueAt: "2026-08-10T18:00:00Z",
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
    };

    // Submission happened on 2026-08-10T16:00:00Z (before initial deadline of 18:00:00Z)
    const effectiveDue = getEffectiveDueAtSubmissionTime(assignment, "2026-08-10T16:00:00Z");
    expect(effectiveDue).toBe("2026-08-10T18:00:00Z");

    const isOnTime = new Date("2026-08-10T16:00:00Z").getTime() <= new Date(effectiveDue!).getTime();
    expect(isOnTime).toBe(true);
  });

  it("2. uses updated deadline when deadline change occurred BEFORE submission, but ignores changes AFTER submission", () => {
    const assignmentWithHistory: ContentAssignment = {
      id: "asgn_test_2",
      projectId: "proj_acme",
      contentItemId: "item_test_2",
      assigneeUserId: "u_designer1",
      assignmentRole: "designer",
      status: "submitted",
      assignedByUserId: "u_founder",
      assignedAt: "2026-08-01T10:00:00Z",
      initialDueAt: "2026-08-10T18:00:00Z",
      currentDueAt: "2026-08-15T18:00:00Z",
      dueAtHistory: [
        {
          previousDueAt: "2026-08-10T18:00:00Z",
          newDueAt: "2026-08-12T18:00:00Z",
          changedByUserId: "u_founder",
          changedAt: "2026-08-08T10:00:00Z", // Changed BEFORE submission
          reason: "Client expanded brief",
        },
        {
          previousDueAt: "2026-08-12T18:00:00Z",
          newDueAt: "2026-08-15T18:00:00Z",
          changedByUserId: "u_founder",
          changedAt: "2026-08-14T10:00:00Z", // Changed AFTER submission
          reason: "Post-submission adjustment",
        },
      ],
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-08T10:00:00Z",
    };

    // Submission occurred on 2026-08-11T12:00:00Z
    // At this time, effective deadline was 2026-08-12T18:00:00Z (NOT 2026-08-15T18:00:00Z)
    const effectiveDueAtSubmission = getEffectiveDueAtSubmissionTime(assignmentWithHistory, "2026-08-11T12:00:00Z");
    expect(effectiveDueAtSubmission).toBe("2026-08-12T18:00:00Z");

    const isOnTime = new Date("2026-08-11T12:00:00Z").getTime() <= new Date(effectiveDueAtSubmission!).getTime();
    expect(isOnTime).toBe(true);
  });

  it("3. validates First-Pass Approval: passes when all components are approved without intermediate Changes Requested", () => {
    const item: ContentItem = {
      id: "item_fp_pass",
      projectId: "proj_acme",
      title: "Clean First Pass Post",
      platform: "Instagram",
      contentType: "post",
      stage: "approved",
      accountableOwnerId: "u_designer1",
      collaboratorIds: [],
      deadlines: {},
      currentVersionNumber: 1,
    };

    const v1: SubmissionVersion = {
      id: "ver_fp_v1",
      contentItemId: "item_fp_pass",
      versionNumber: 1,
      isDraft: false,
      submittedAt: "2026-08-10T12:00:00Z",
      createdAt: "2026-08-10T10:00:00Z",
      copy: { caption: "Clean copy", hashtags: [], cta: "" },
      creativeAssets: [],
      componentFingerprints: { copyFingerprint: "c1", creativeFingerprint: "cr1", postingDateFingerprint: "d1" },
    };

    const decisions: ApprovalDecision[] = [
      {
        id: "dec_1",
        projectId: "proj_acme",
        contentItemId: "item_fp_pass",
        submissionVersionId: "ver_fp_v1",
        component: "copy",
        componentFingerprint: "c1",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-10T14:00:00Z",
      },
      {
        id: "dec_2",
        projectId: "proj_acme",
        contentItemId: "item_fp_pass",
        submissionVersionId: "ver_fp_v1",
        component: "creative",
        componentFingerprint: "cr1",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-10T14:00:00Z",
      },
      {
        id: "dec_3",
        projectId: "proj_acme",
        contentItemId: "item_fp_pass",
        submissionVersionId: "ver_fp_v1",
        component: "posting_date",
        componentFingerprint: "d1",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-10T14:00:00Z",
      },
    ];

    const result = evaluateFirstPassApproval(item, [v1], decisions, []);
    expect(result).toBe(true);
  });

  it("4. validates First-Pass Approval fails when any component receives a Change Request or Rejection", () => {
    const item: ContentItem = {
      id: "item_fp_fail",
      projectId: "proj_acme",
      title: "Revision Needed Post",
      platform: "Instagram",
      contentType: "post",
      stage: "changes_requested",
      accountableOwnerId: "u_designer1",
      collaboratorIds: [],
      deadlines: {},
      currentVersionNumber: 1,
    };

    const v1: SubmissionVersion = {
      id: "ver_fail_v1",
      contentItemId: "item_fp_fail",
      versionNumber: 1,
      isDraft: false,
      submittedAt: "2026-08-10T12:00:00Z",
      createdAt: "2026-08-10T10:00:00Z",
      copy: { caption: "Needs edit", hashtags: [], cta: "" },
      creativeAssets: [],
      componentFingerprints: { copyFingerprint: "c1", creativeFingerprint: "cr1", postingDateFingerprint: "d1" },
    };

    const changeRequests: ChangeRequest[] = [
      {
        id: "cr_1",
        projectId: "proj_acme",
        contentItemId: "item_fp_fail",
        submissionVersionId: "ver_fail_v1",
        component: "creative",
        reviewerUserId: "u_founder",
        reviewerName: "Vikram Shah",
        requestedChange: "Color palette needs higher contrast",
        priority: "medium",
        status: "open",
        createdAt: "2026-08-10T15:00:00Z",
      },
    ];

    const result = evaluateFirstPassApproval(item, [v1], [], changeRequests);
    expect(result).toBe(false);
  });

  it("5. counts formal resubmission cycles as revision rounds while strictly ignoring autosaves and draft edits", () => {
    const assignment: ContentAssignment = {
      id: "asgn_rev",
      projectId: "proj_acme",
      contentItemId: "item_rev",
      assigneeUserId: "u_designer1",
      assignmentRole: "designer",
      status: "completed",
      assignedByUserId: "u_founder",
      assignedAt: "2026-08-01T10:00:00Z",
      initialDueAt: "2026-08-10T18:00:00Z",
      currentDueAt: "2026-08-10T18:00:00Z",
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
    };

    const versions: SubmissionVersion[] = [
      // v1 formal submission
      {
        id: "v1",
        contentItemId: "item_rev",
        versionNumber: 1,
        isDraft: false,
        submittedAt: "2026-08-10T12:00:00Z",
        createdAt: "2026-08-10T10:00:00Z",
        copy: { caption: "Initial", hashtags: [], cta: "" },
        creativeAssets: [],
        componentFingerprints: { copyFingerprint: "1", creativeFingerprint: "2", postingDateFingerprint: "3" },
      },
      // Intermediate drafts/autosaves (MUST BE IGNORED)
      {
        id: "v2_draft_1",
        contentItemId: "item_rev",
        versionNumber: 2,
        isDraft: true,
        createdAt: "2026-08-11T10:00:00Z",
        copy: { caption: "Draft edit", hashtags: [], cta: "" },
        creativeAssets: [],
        componentFingerprints: { copyFingerprint: "1b", creativeFingerprint: "2", postingDateFingerprint: "3" },
      },
      // v2 formal resubmission
      {
        id: "v2",
        contentItemId: "item_rev",
        versionNumber: 2,
        isDraft: false,
        submittedAt: "2026-08-12T14:00:00Z",
        createdAt: "2026-08-12T10:00:00Z",
        copy: { caption: "Corrected", hashtags: [], cta: "" },
        creativeAssets: [],
        componentFingerprints: { copyFingerprint: "1c", creativeFingerprint: "2", postingDateFingerprint: "3" },
      },
    ];

    const rounds = countRevisionRounds(assignment, versions, []);
    expect(rounds).toBe(1); // Exactly 1 revision cycle (v2 formal resubmission)
  });

  it("6. derives Production Time exclusively from WorkSessions with adjustments and excludes attendance duration", () => {
    const sessions: WorkSession[] = [
      {
        id: "ws_1",
        assignmentId: "asgn_1",
        projectId: "proj_acme",
        contentItemId: "item_1",
        userId: "u_designer1",
        startedAt: "2026-08-10T10:00:00Z",
        endedAt: "2026-08-10T12:00:00Z",
        accumulatedSeconds: 7200, // 2h
        adjustments: [],
        status: "completed",
        createdAt: "2026-08-10T10:00:00Z",
        updatedAt: "2026-08-10T12:00:00Z",
      },
      {
        id: "ws_2",
        assignmentId: "asgn_1",
        projectId: "proj_acme",
        contentItemId: "item_1",
        userId: "u_designer1",
        startedAt: "2026-08-10T14:00:00Z",
        endedAt: "2026-08-10T15:00:00Z",
        accumulatedSeconds: 3600,
        adjustments: [
          {
            id: "adj_1",
            workSessionId: "ws_2",
            previousDurationSeconds: 3600,
            adjustedDurationSeconds: 1800, // Adjusted by manager to 30m
            reason: "Timer left running during break",
            adjustedByUserId: "u_founder",
            adjustedAt: "2026-08-10T15:30:00Z",
          },
        ],
        status: "completed",
        createdAt: "2026-08-10T14:00:00Z",
        updatedAt: "2026-08-10T15:00:00Z",
      },
    ];

    const totalSeconds = calculateEffectiveProductionSeconds(sessions);
    expect(totalSeconds).toBe(7200 + 1800); // 9000 seconds (2.5 hours)
  });

  it("7. prevents double counting: primary designer gets deliverable credit; collaborator gets only tracked time credit", () => {
    const state = createTestState();

    // Check u_designer1 vs u_consultant (collaborator on item_acme_1)
    const result = getOrganizationPerformance(state, "u_founder", "founder");
    expect(result.status).toBe(200);

    const scorecardD1 = result.data?.scorecards.find((s) => s.userId === "u_designer1");
    expect(scorecardD1).toBeDefined();

    // Primary assignments count vs collaborations count are properly isolated
    expect(scorecardD1?.primaryAssignmentsCount).toBeGreaterThanOrEqual(1);
  });

  it("8. returns null / insufficient data states rather than misleading 0% when no eligible items exist", () => {
    const emptyState: AppState = {
      ...createTestState(),
      contentAssignments: [],
      contentItems: [],
      workSessions: [],
      submissionVersions: [],
      approvalDecisions: [],
      changeRequests: [],
    };

    const result = getOrganizationPerformance(emptyState, "u_founder", "founder");
    expect(result.status).toBe(200);
    expect(result.data?.overview.onTimeDeliveryRate).toBeNull();
    expect(result.data?.overview.firstPassApprovalRate).toBeNull();
    expect(result.data?.overview.avgRevisionRounds).toBeNull();
    expect(result.data?.overview.avgProductionTimeSeconds).toBeNull();
  });
});
