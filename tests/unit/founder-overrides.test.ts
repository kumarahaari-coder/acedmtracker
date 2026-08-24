import { describe, it, expect } from "vitest";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { ContentItem, FounderOverride, SubmissionVersion } from "@/lib/types";

describe("Founder Overrides & Audit Persistence", () => {
  const mockItem: ContentItem = {
    id: "item_test_override",
    projectId: "proj_acme",
    title: "Urgent Release Post",
    platform: "LinkedIn",
    contentType: "post",
    stage: "changes_requested",
    accountableOwnerId: "u_consultant",
    collaboratorIds: [],
    deadlines: {},
    currentVersionNumber: 1,
  };

  const mockVersion: SubmissionVersion = {
    id: "ver_override",
    contentItemId: "item_test_override",
    versionNumber: 1,
    isDraft: false,
    createdAt: "2026-08-20T10:00:00Z",
    copy: { caption: "Content", hashtags: [], cta: "" },
    creativeAssets: [],
    componentFingerprints: {
      copyFingerprint: "c1",
      creativeFingerprint: "cr1",
      postingDateFingerprint: "d1",
    },
  };

  it("advances item approval state when FounderOverride entity is present without erasing prior decisions", () => {
    const overrides: FounderOverride[] = [
      {
        id: "ovr_1",
        projectId: "proj_acme",
        contentItemId: "item_test_override",
        submissionVersionId: "ver_override",
        reason: "CEO expedited emergency client launch",
        actorUserId: "u_founder",
        createdAt: "2026-08-20T12:00:00Z",
      },
    ];

    const summary = getItemApprovalMatrixSummary(mockItem, mockVersion, [], overrides);
    expect(summary.isOverridden).toBe(true);
    expect(summary.allComponentsApproved).toBe(true);
    expect(summary.overrideObj?.reason).toBe("CEO expedited emergency client launch");
  });
});
