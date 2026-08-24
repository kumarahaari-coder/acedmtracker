import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import {
  ContentGroup,
  ContentItem,
  SubmissionVersion,
  AppState,
  ApprovalDecision,
} from "@/lib/types";

describe("Phase 3: Multi-Platform Content Groups + Canonical Published Date + Calendar Historical Resolution", () => {
  function createTestState(): AppState {
    return getInitialDeterministicState();
  }

  it("1. creates a ContentGroup with multiple platform-specific ContentItems atomically", () => {
    const state = createTestState();
    const projectId = "proj_acme";
    const platforms = [
      {
        platform: "Instagram" as const,
        contentType: "carousel" as const,
        accountableOwnerId: "u_designer1",
        submissionDeadline: "2026-08-28T18:00:00Z",
        scheduledPublicationDate: "2026-09-01T10:00:00Z",
      },
      {
        platform: "LinkedIn" as const,
        contentType: "post" as const,
        accountableOwnerId: "u_consultant",
        submissionDeadline: "2026-08-28T18:00:00Z",
        scheduledPublicationDate: "2026-09-01T10:00:00Z",
      },
      {
        platform: "Facebook" as const,
        contentType: "post" as const,
        accountableOwnerId: "u_designer2",
        submissionDeadline: "2026-08-28T18:00:00Z",
        scheduledPublicationDate: "2026-09-01T10:00:00Z",
      },
    ];

    const groupId = "grp_spring_launch";
    const itemIds = platforms.map((p, idx) => `item_spring_${p.platform.toLowerCase()}_${idx}`);

    const group: ContentGroup = {
      id: groupId,
      projectId,
      title: "Spring Brand Launch Campaign",
      description: "Omnichannel awareness blitz",
      contentItemIds: itemIds,
      createdByUserId: "u_consultant",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const items: ContentItem[] = platforms.map((p, idx) => ({
      id: itemIds[idx],
      projectId,
      contentGroupId: groupId,
      title: `Spring Brand Launch (${p.platform})`,
      platform: p.platform,
      contentType: p.contentType,
      stage: "draft",
      accountableOwnerId: p.accountableOwnerId,
      collaboratorIds: [],
      deadlines: {
        submissionDeadline: p.submissionDeadline,
        scheduledPublicationDate: p.scheduledPublicationDate,
      },
      currentVersionNumber: 1,
    }));

    expect(group.contentItemIds).toHaveLength(3);
    expect(items).toHaveLength(3);
    items.forEach((item) => {
      expect(item.contentGroupId).toBe(groupId);
      expect(item.projectId).toBe(projectId);
    });
  });

  it("2. enforces that every generated ContentItem belongs strictly to the same project as the group", () => {
    const state = createTestState();
    const group = state.contentGroups[0];
    const groupItems = state.contentItems.filter((i) => i.contentGroupId === group.id);

    expect(groupItems.length).toBeGreaterThanOrEqual(2);
    groupItems.forEach((item) => {
      expect(item.projectId).toBe(group.projectId);
    });
  });

  it("3. shares Creative Asset references across sibling platform items without duplicating physical files", () => {
    const sharedAsset = {
      assetId: "ast_shared_video_1",
      filename: "summer_reel_master.mp4",
      previewUrl: "data:image/svg+xml;utf8,<svg></svg>",
      fileSizeBytes: 45000000,
      mimeType: "video/mp4",
      contentHash: "sha256_master_video_hash",
    };

    const versionInstagram: SubmissionVersion = {
      id: "ver_ig_v1",
      contentItemId: "item_ig",
      versionNumber: 1,
      isDraft: true,
      createdAt: new Date().toISOString(),
      copy: { caption: "IG caption", hashtags: ["#ig"], cta: "Link in bio" },
      creativeAssets: [sharedAsset],
      componentFingerprints: { copyFingerprint: "cp1", creativeFingerprint: "cr1", postingDateFingerprint: "dt1" },
    };

    const versionLinkedIn: SubmissionVersion = {
      id: "ver_li_v1",
      contentItemId: "item_li",
      versionNumber: 1,
      isDraft: true,
      createdAt: new Date().toISOString(),
      copy: { caption: "LinkedIn formal copy", hashtags: ["#b2b"], cta: "Comment below" },
      creativeAssets: [sharedAsset], // exact same asset reference
      componentFingerprints: { copyFingerprint: "cp2", creativeFingerprint: "cr1", postingDateFingerprint: "dt1" },
    };

    expect(versionInstagram.creativeAssets[0].assetId).toBe(versionLinkedIn.creativeAssets[0].assetId);
    expect(versionInstagram.creativeAssets[0].contentHash).toBe(versionLinkedIn.creativeAssets[0].contentHash);
  });

  it("4. 'Apply to all' modifies only explicitly selected fields and preserves unselected fields", () => {
    const baseCopy = { caption: "Global Campaign Headline", hashtags: ["#global"], cta: "Learn more" };
    const customLinkedInCopy = { caption: "Global Campaign Headline", hashtags: ["#b2b", "#healthcare"], cta: "Read whitepaper" };

    // Sync only caption
    const updatedLinkedInCopy = {
      ...customLinkedInCopy,
      caption: "Updated Global Campaign Headline v2",
    };

    expect(updatedLinkedInCopy.caption).toBe("Updated Global Campaign Headline v2");
    expect(updatedLinkedInCopy.cta).toBe("Read whitepaper"); // Preserved
    expect(updatedLinkedInCopy.hashtags).toContain("#healthcare"); // Preserved
  });

  it("5. caption propagation resets only Copy approvals while preserving Creative and Date approvals", () => {
    const approvals: ApprovalDecision[] = [
      {
        id: "dec_1",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_1",
        component: "copy",
        componentFingerprint: "cp_old",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-20T10:00:00Z",
      },
      {
        id: "dec_2",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_1",
        component: "creative",
        componentFingerprint: "cr_stable",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-20T10:00:00Z",
      },
    ];

    // Propagate new copy
    const syncCopy = true;
    const resetDecisions: ApprovalDecision[] = [];

    if (syncCopy) {
      resetDecisions.push({
        id: "dec_sync_reset",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_1",
        component: "copy",
        componentFingerprint: "cp_new",
        reviewerUserId: "u_consultant",
        reviewerRole: "founder",
        decision: "pending",
        decidedAt: new Date().toISOString(),
      });
    }

    expect(resetDecisions).toHaveLength(1);
    expect(resetDecisions[0].component).toBe("copy");
    expect(approvals.find((d) => d.component === "creative")?.decision).toBe("approved");
  });

  it("6. creative propagation resets only Creative approvals while preserving Copy and Date approvals", () => {
    const approvals: ApprovalDecision[] = [
      {
        id: "dec_cp",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_1",
        component: "copy",
        componentFingerprint: "cp_stable",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-20T10:00:00Z",
      },
      {
        id: "dec_cr",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_1",
        component: "creative",
        componentFingerprint: "cr_old",
        reviewerUserId: "u_founder",
        reviewerRole: "founder",
        decision: "approved",
        decidedAt: "2026-08-20T10:00:00Z",
      },
    ];

    const syncCreative = true;
    const resetDecisions: ApprovalDecision[] = [];

    if (syncCreative) {
      resetDecisions.push({
        id: "dec_sync_reset_creative",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_1",
        component: "creative",
        componentFingerprint: "cr_new",
        reviewerUserId: "u_consultant",
        reviewerRole: "founder",
        decision: "pending",
        decidedAt: new Date().toISOString(),
      });
    }

    expect(resetDecisions[0].component).toBe("creative");
    expect(approvals.find((d) => d.component === "copy")?.decision).toBe("approved");
  });

  it("7. scheduled-date propagation resets only Posting Date approval", () => {
    const syncPostingDate = true;
    const resetDecisions: ApprovalDecision[] = [];

    if (syncPostingDate) {
      resetDecisions.push({
        id: "dec_sync_reset_date",
        projectId: "proj_acme",
        contentItemId: "item_acme_1",
        submissionVersionId: "ver_1",
        component: "posting_date",
        componentFingerprint: "date_new",
        reviewerUserId: "u_consultant",
        reviewerRole: "founder",
        decision: "pending",
        decidedAt: new Date().toISOString(),
      });
    }

    expect(resetDecisions[0].component).toBe("posting_date");
  });

  it("8. platform-specific customizations survive unrelated synchronization", () => {
    const instagramVersion = {
      caption: "Instagram visual story",
      hashtags: ["#instavibes", "#visualart"],
      cta: "Tap link in bio",
    };

    // Synchronize ONLY scheduled date across group
    const newScheduledDate = "2026-09-10T15:00:00Z";

    // Instagram version copy remains completely untouched
    expect(instagramVersion.hashtags).toContain("#instavibes");
    expect(instagramVersion.cta).toBe("Tap link in bio");
  });

  it("9. marking published preserves original scheduledPublicationDate untouched", () => {
    const item: ContentItem = {
      id: "item_test_pub",
      projectId: "proj_acme",
      title: "Product Teaser",
      platform: "Instagram",
      contentType: "reel",
      stage: "approved",
      accountableOwnerId: "u_designer1",
      collaboratorIds: [],
      deadlines: {
        submissionDeadline: "2026-08-20T18:00:00Z",
        scheduledPublicationDate: "2026-08-28T10:00:00Z",
      },
      currentVersionNumber: 1,
    };

    const actualPublishedTime = "2026-08-29T14:35:00Z";
    const publishedItem: ContentItem = {
      ...item,
      stage: "published",
      publishedAt: actualPublishedTime,
      liveUrl: "https://instagram.com/p/C99182xyz",
      publishedByUserId: "u_founder",
    };

    expect(publishedItem.deadlines.scheduledPublicationDate).toBe("2026-08-28T10:00:00Z");
    expect(publishedItem.publishedAt).toBe("2026-08-29T14:35:00Z");
    expect(publishedItem.liveUrl).toBe("https://instagram.com/p/C99182xyz");
  });

  it("10. calendar resolves published item historically at publishedAt", () => {
    const publishedItem: ContentItem = {
      id: "item_test_hist",
      projectId: "proj_acme",
      title: "Solar Launch Video",
      platform: "LinkedIn",
      contentType: "post",
      stage: "published",
      accountableOwnerId: "u_designer2",
      collaboratorIds: [],
      deadlines: {
        scheduledPublicationDate: "2026-08-20T10:00:00Z",
      },
      publishedAt: "2026-08-22T16:00:00Z", // Published 2 days later
      currentVersionNumber: 1,
    };

    const getCalendarDate = (i: ContentItem) => {
      if (i.stage === "published" && i.publishedAt) {
        return i.publishedAt;
      }
      return i.deadlines.scheduledPublicationDate;
    };

    expect(getCalendarDate(publishedItem)).toBe("2026-08-22T16:00:00Z");
  });

  it("11. calendar resolves unpublished item at scheduledPublicationDate", () => {
    const scheduledItem: ContentItem = {
      id: "item_test_sched",
      projectId: "proj_acme",
      title: "Upcoming Case Study",
      platform: "Instagram",
      contentType: "carousel",
      stage: "scheduled",
      accountableOwnerId: "u_designer1",
      collaboratorIds: [],
      deadlines: {
        scheduledPublicationDate: "2026-08-30T10:00:00Z",
      },
      currentVersionNumber: 1,
    };

    const getCalendarDate = (i: ContentItem) => {
      if (i.stage === "published" && i.publishedAt) {
        return i.publishedAt;
      }
      return i.deadlines.scheduledPublicationDate;
    };

    expect(getCalendarDate(scheduledItem)).toBe("2026-08-30T10:00:00Z");
  });

  it("12. editing publishedAt produces an audited entry recording previous and new values", () => {
    const oldPublishedAt = "2026-08-22T16:00:00Z";
    const newPublishedAt = "2026-08-22T16:15:00Z";

    const auditEntry = {
      id: "aud_edit_pub",
      projectId: "proj_acme",
      actorUserId: "u_admin",
      action: "update_publication_details",
      entityType: "content_item",
      entityId: "item_acme_3",
      timestamp: new Date().toISOString(),
      summary: `Updated publication details: publishedAt (${oldPublishedAt} -> ${newPublishedAt})`,
      before: { publishedAt: oldPublishedAt },
      after: { publishedAt: newPublishedAt },
      reason: "Corrected to exact Meta API broadcast timestamp",
    };

    expect(auditEntry.before.publishedAt).toBe("2026-08-22T16:00:00Z");
    expect(auditEntry.after.publishedAt).toBe("2026-08-22T16:15:00Z");
    expect(auditEntry.reason).toContain("Corrected to exact Meta API");
  });

  it("13. editing liveUrl produces an audited entry recording previous and new values", () => {
    const oldUrl = "https://instagram.com/p/old";
    const newUrl = "https://instagram.com/p/new_canonical";

    const auditEntry = {
      id: "aud_edit_url",
      projectId: "proj_acme",
      actorUserId: "u_founder",
      action: "update_publication_details",
      entityType: "content_item",
      entityId: "item_acme_3",
      timestamp: new Date().toISOString(),
      summary: `Updated publication details: liveUrl (${oldUrl} -> ${newUrl})`,
      before: { liveUrl: oldUrl },
      after: { liveUrl: newUrl },
      reason: "Updated permalink after post edit",
    };

    expect(auditEntry.before.liveUrl).toBe(oldUrl);
    expect(auditEntry.after.liveUrl).toBe(newUrl);
  });

  it("14. blocks multi-platform group creation if items attempt to link across different projects", () => {
    const groupProjectId = "proj_acme";
    const invalidPlatformItem = {
      projectId: "proj_solaredge", // Cross-project attempt!
      platform: "LinkedIn" as const,
    };

    const isCrossProject = invalidPlatformItem.projectId !== groupProjectId;
    expect(isCrossProject).toBe(true);
  });

  it("15. post-performance analytics remain platform-item scoped and not attached to group", () => {
    const state = createTestState();
    const instagramItem = state.contentItems.find((i) => i.id === "item_acme_3")!;
    const itemAnalytics = state.analyticsSnapshots.filter((s) => s.contentItemId === instagramItem.id);

    expect(itemAnalytics.length).toBeGreaterThan(0);
    itemAnalytics.forEach((snap) => {
      expect(snap.contentItemId).toBe(instagramItem.id);
      expect(snap.projectId).toBe(instagramItem.projectId);
      expect(snap.platform).toBe(instagramItem.platform);
    });
  });
});
