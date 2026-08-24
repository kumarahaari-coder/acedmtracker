import { describe, it, expect } from "vitest";
import { getItemApprovalMatrixSummary, getComponentApprovalSummary } from "@/lib/derived";
import { ApprovalDecision, ContentItem, SubmissionVersion } from "@/lib/types";

describe("Approval Matrix & Aggregation Logic", () => {
  const mockItem: ContentItem = {
    id: "item_test_1",
    projectId: "proj_acme",
    title: "Test Reel",
    platform: "Instagram",
    contentType: "reel",
    stage: "in_review",
    accountableOwnerId: "u_designer1",
    collaboratorIds: ["u_consultant"],
    deadlines: {},
    currentVersionNumber: 1,
  };

  const mockVersion: SubmissionVersion = {
    id: "ver_1",
    contentItemId: "item_test_1",
    versionNumber: 1,
    isDraft: false,
    createdAt: "2026-08-20T10:00:00Z",
    copy: { caption: "Test", hashtags: ["test"], cta: "Link in bio" },
    creativeAssets: [{ assetId: "a1", filename: "test.png", previewUrl: "", fileSizeBytes: 1000, mimeType: "image/png", contentHash: "hash_1" }],
    scheduledDate: "2026-08-25T10:00:00Z",
    componentFingerprints: {
      copyFingerprint: "copy_hash_1",
      creativeFingerprint: "creative_hash_1",
      postingDateFingerprint: "date_hash_1",
    },
  };

  it("requires BOTH Founder and Consultant approval for a component to be fully approved", () => {
    // Only consultant approved
    const decisions1: ApprovalDecision[] = [
      {
        id: "d1",
        projectId: "proj_acme",
        contentItemId: "item_test_1",
        submissionVersionId: "ver_1",
        component: "copy",
        componentFingerprint: "copy_hash_1",
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-20T11:00:00Z",
      },
    ];

    const summary1 = getComponentApprovalSummary("copy", mockVersion, decisions1);
    expect(summary1.isFullyApproved).toBe(false);
    expect(summary1.consultant).toBe("approved");
    expect(summary1.founder).toBe("pending");

    // Both approved
    const decisions2: ApprovalDecision[] = [
      ...decisions1,
      {
        id: "d2",
        projectId: "proj_acme",
        contentItemId: "item_test_1",
        submissionVersionId: "ver_1",
        component: "copy",
        componentFingerprint: "copy_hash_1",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-20T12:00:00Z",
      },
    ];

    const summary2 = getComponentApprovalSummary("copy", mockVersion, decisions2);
    expect(summary2.isFullyApproved).toBe(true);
    expect(summary2.consultant).toBe("approved");
    expect(summary2.founder).toBe("approved");
  });

  it("rejection or approved_with_conditions by either reviewer blocks final approval", () => {
    const decisions: ApprovalDecision[] = [
      {
        id: "d1",
        projectId: "proj_acme",
        contentItemId: "item_test_1",
        submissionVersionId: "ver_1",
        component: "creative",
        componentFingerprint: "creative_hash_1",
        reviewerUserId: "u_consultant",
        reviewerRole: "consultant",
        decision: "approved",
        decidedAt: "2026-08-20T11:00:00Z",
      },
      {
        id: "d2",
        projectId: "proj_acme",
        contentItemId: "item_test_1",
        submissionVersionId: "ver_1",
        component: "creative",
        componentFingerprint: "creative_hash_1",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved_with_conditions",
        decidedAt: "2026-08-20T12:00:00Z",
      },
    ];

    const summary = getComponentApprovalSummary("creative", mockVersion, decisions);
    expect(summary.isFullyApproved).toBe(false);
    expect(summary.hasChangesRequested).toBe(true);
  });
});
