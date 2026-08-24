import { describe, it, expect } from "vitest";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { ContentItem, SubmissionVersion, ApprovalDecision } from "@/lib/types";

describe("Workflow Stage Gating & Kanban Stage Transition Validation", () => {
  const mockItem: ContentItem = {
    id: "item_test_gates",
    projectId: "proj_acme",
    title: "Gated Item Test",
    platform: "Instagram",
    contentType: "carousel",
    stage: "in_review",
    accountableOwnerId: "u_designer1",
    collaboratorIds: [],
    deadlines: {},
    currentVersionNumber: 1,
    latestSubmittedVersionId: "ver_gate_1",
  };

  const mockVersion: SubmissionVersion = {
    id: "ver_gate_1",
    contentItemId: "item_test_gates",
    versionNumber: 1,
    isDraft: false,
    createdAt: "2026-08-20T10:00:00Z",
    copy: { caption: "Test", hashtags: [], cta: "" },
    creativeAssets: [],
    componentFingerprints: {
      copyFingerprint: "cp1",
      creativeFingerprint: "cr1",
      postingDateFingerprint: "dt1",
    },
  };

  it("blocks transition to Approved when any of the 3 components lacks approval", () => {
    // Only 2 of 3 components approved (copy & date approved, creative missing founder)
    const partialDecisions: ApprovalDecision[] = [
      { id: "1", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "copy", componentFingerprint: "cp1", reviewerUserId: "u_consultant", reviewerRole: "consultant", decision: "approved", decidedAt: "" },
      { id: "2", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "copy", componentFingerprint: "cp1", reviewerUserId: "u_founder", reviewerRole: "founder", decision: "approved", decidedAt: "" },
      { id: "3", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "posting_date", componentFingerprint: "dt1", reviewerUserId: "u_consultant", reviewerRole: "consultant", decision: "approved", decidedAt: "" },
      { id: "4", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "posting_date", componentFingerprint: "dt1", reviewerUserId: "u_founder", reviewerRole: "founder", decision: "approved", decidedAt: "" },
      { id: "5", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "creative", componentFingerprint: "cr1", reviewerUserId: "u_consultant", reviewerRole: "consultant", decision: "approved", decidedAt: "" },
      // Missing founder decision on creative!
    ];

    const summary = getItemApprovalMatrixSummary(mockItem, mockVersion, partialDecisions, []);
    expect(summary.allComponentsApproved).toBe(false);
    expect(summary.approvedCount).toBe(2);
  });

  it("allows transition to Approved once all 3 components receive 2/2 approvals", () => {
    const fullDecisions: ApprovalDecision[] = [
      { id: "1", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "copy", componentFingerprint: "cp1", reviewerUserId: "u_consultant", reviewerRole: "consultant", decision: "approved", decidedAt: "" },
      { id: "2", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "copy", componentFingerprint: "cp1", reviewerUserId: "u_founder", reviewerRole: "founder", decision: "approved", decidedAt: "" },
      { id: "3", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "posting_date", componentFingerprint: "dt1", reviewerUserId: "u_consultant", reviewerRole: "consultant", decision: "approved", decidedAt: "" },
      { id: "4", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "posting_date", componentFingerprint: "dt1", reviewerUserId: "u_founder", reviewerRole: "founder", decision: "approved", decidedAt: "" },
      { id: "5", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "creative", componentFingerprint: "cr1", reviewerUserId: "u_consultant", reviewerRole: "consultant", decision: "approved", decidedAt: "" },
      { id: "6", projectId: "proj_acme", contentItemId: mockItem.id, submissionVersionId: mockVersion.id, component: "creative", componentFingerprint: "cr1", reviewerUserId: "u_founder", reviewerRole: "founder", decision: "approved", decidedAt: "" },
    ];

    const summary = getItemApprovalMatrixSummary(mockItem, mockVersion, fullDecisions, []);
    expect(summary.allComponentsApproved).toBe(true);
    expect(summary.approvedCount).toBe(3);
  });
});
