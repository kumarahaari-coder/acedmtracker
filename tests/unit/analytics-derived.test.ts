import { describe, it, expect } from "vitest";
import { getDerivedItemAnalytics, computeBestTimeRecommendation } from "@/lib/derived";
import { AnalyticsSnapshot, ContentItem } from "@/lib/types";

describe("Analytics Derived State & Project Isolation", () => {
  it("derives cumulative commercial metrics from dated snapshot history", () => {
    const snapshots: AnalyticsSnapshot[] = [
      {
        id: "s1",
        projectId: "proj_acme",
        contentItemId: "item_1",
        snapshotDate: "2026-08-15",
        platform: "Instagram",
        reach: 1000,
        impressions: 1500,
        engagementRate: 5.0,
        clicks: 50,
        leads: 5,
        revenue: 15000,
      },
      {
        id: "s2",
        projectId: "proj_acme",
        contentItemId: "item_1",
        snapshotDate: "2026-08-18",
        platform: "Instagram",
        reach: 2500,
        impressions: 3800,
        engagementRate: 6.2,
        clicks: 120,
        leads: 12,
        revenue: 36000,
      },
    ];

    const metrics = getDerivedItemAnalytics("item_1", snapshots);
    // Should reflect latest snapshot on 2026-08-18
    expect(metrics.reach).toBe(2500);
    expect(metrics.revenue).toBe(36000);
    expect(metrics.snapshotsCount).toBe(2);
  });

  it("warns about insufficient history if project has fewer than 10 published snapshots", () => {
    const items: ContentItem[] = [
      {
        id: "item_1",
        projectId: "proj_acme",
        title: "P1",
        platform: "Instagram",
        contentType: "post",
        stage: "published",
        accountableOwnerId: "u_1",
        collaboratorIds: [],
        deadlines: {},
        currentVersionNumber: 1,
      },
    ];

    const snapshots: AnalyticsSnapshot[] = [
      {
        id: "s1",
        projectId: "proj_acme",
        contentItemId: "item_1",
        snapshotDate: "2026-08-18",
        platform: "Instagram",
        reach: 1000,
        impressions: 1200,
        engagementRate: 4.5,
        clicks: 20,
        leads: 2,
        revenue: 5000,
      },
    ];

    const recommendation = computeBestTimeRecommendation("proj_acme", snapshots, items);
    expect(recommendation.hasRecommendation).toBe(false);
    expect(recommendation.sampleCount).toBe(1);
    expect(recommendation.minRequired).toBe(10);
  });
});
