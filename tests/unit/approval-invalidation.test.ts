import { describe, it, expect } from "vitest";
import { computeCopyFingerprint, computeCreativeFingerprint, computePostingDateFingerprint } from "@/lib/fingerprints";
import { getComponentApprovalSummary } from "@/lib/derived";
import { ApprovalDecision, SubmissionVersion } from "@/lib/types";

describe("Component Fingerprinting & Approval Invalidation", () => {
  it("generates different fingerprints when copy is modified", () => {
    const copy1 = { caption: "Hello world", hashtags: ["marketing"], cta: "Click here" };
    const copy2 = { caption: "Hello world updated", hashtags: ["marketing"], cta: "Click here" };

    const fp1 = computeCopyFingerprint(copy1);
    const fp2 = computeCopyFingerprint(copy2);

    expect(fp1).not.toEqual(fp2);
  });

  it("preserves fingerprint when hashtags order changes but content is identical", () => {
    const copy1 = { caption: "Brand post", hashtags: ["alpha", "beta"], cta: "Learn more" };
    const copy2 = { caption: "Brand post", hashtags: ["beta", "alpha"], cta: "Learn more" };

    const fp1 = computeCopyFingerprint(copy1);
    const fp2 = computeCopyFingerprint(copy2);

    expect(fp1).toEqual(fp2);
  });

  it("invalidates approvals when component fingerprint does not match decision fingerprint", () => {
    const oldVersion: SubmissionVersion = {
      id: "ver_old",
      contentItemId: "item_1",
      versionNumber: 1,
      isDraft: false,
      createdAt: "2026-08-20T10:00:00Z",
      copy: { caption: "Old Caption", hashtags: [], cta: "" },
      creativeAssets: [],
      componentFingerprints: {
        copyFingerprint: "copy_v1_hash",
        creativeFingerprint: "creative_shared_hash",
        postingDateFingerprint: "date_shared_hash",
      },
    };

    const newVersion: SubmissionVersion = {
      ...oldVersion,
      id: "ver_new",
      versionNumber: 2,
      copy: { caption: "New Edited Caption", hashtags: [], cta: "" },
      componentFingerprints: {
        copyFingerprint: "copy_v2_hash", // Changed!
        creativeFingerprint: "creative_shared_hash", // Unchanged
        postingDateFingerprint: "date_shared_hash", // Unchanged
      },
    };

    const oldDecisions: ApprovalDecision[] = [
      {
        id: "d1",
        projectId: "proj_acme",
        contentItemId: "item_1",
        submissionVersionId: "ver_new",
        component: "copy",
        componentFingerprint: "copy_v1_hash", // Stored for v1 fingerprint
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-20T11:00:00Z",
      },
    ];

    // On new version, copy has fingerprint "copy_v2_hash", so old decision with "copy_v1_hash" should NOT match
    const summary = getComponentApprovalSummary("copy", newVersion, oldDecisions);
    expect(summary.isFullyApproved).toBe(false);
    expect(summary.founder).toBe("pending");
  });
});
