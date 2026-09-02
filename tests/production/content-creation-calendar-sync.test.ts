import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { assertNonProductionEnvironment } from "@/lib/guards/environment-safety";

import { db } from "@/lib/db";
import { users, projects, contentItems, contentGroups, submissionVersions, contentAssignments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  createContentItemAction,
  createContentGroupAction,
  submitVersionAction,
  markContentPublishedAction,
} from "@/lib/actions/content";
import { createTeamMemberAction } from "@/lib/actions/team";
import { createProjectAction } from "@/lib/actions/projects";
import { getAuthoritativeWorkspaceStateAction } from "@/lib/actions/workspace";

describe("Production Content Creation & Calendar Synchronization Architecture", () => {
  let founderId: string;
  let projectId: string;
  const cleanupItemIds: string[] = [];
  const cleanupGroupIds: string[] = [];

  beforeAll(async () => {
    assertNonProductionEnvironment("Content creation calendar sync test");

    // 1. Resolve or provision founder
    const [existingFounder] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);

    if (existingFounder) {
      founderId = existingFounder.id;
    } else {
      const created = await createTeamMemberAction({
        fullName: "Staging Test Founder",
        email: `staging_founder_${Date.now()}@aceassured.com`,
        role: "founder",
      });
      founderId = created.user!.id;
    }

    // 2. Resolve or provision project
    const [existingProj] = await db.select().from(projects).limit(1);
    if (existingProj) {
      projectId = existingProj.id;
    } else {
      const createdProj = await createProjectAction({
        name: "Staging Test Project",
        clientBrand: "Staging Client",
        actorUserId: founderId,
      });
      projectId = createdProj.project!.id;
    }
  });

  afterAll(async () => {
    // Clean up temporary test items
    if (cleanupItemIds.length > 0) {
      await db.delete(contentAssignments).where(inArray(contentAssignments.contentItemId, cleanupItemIds));
      await db.delete(submissionVersions).where(inArray(submissionVersions.contentItemId, cleanupItemIds));
      await db.delete(contentItems).where(inArray(contentItems.id, cleanupItemIds));
    }
    if (cleanupGroupIds.length > 0) {
      await db.delete(contentGroups).where(inArray(contentGroups.id, cleanupGroupIds));
    }
  });

  it("proves newly created Post, Carousel, Reel, and Trial Reel appear on Calendar immediately with correct schedules", { timeout: 30000 }, async () => {
    const testTypes = [
      { type: "post" as const, title: "Test Post Campaign", date: "2026-09-10" },
      { type: "carousel" as const, title: "Test Carousel Infographic", date: "2026-09-12" },
      { type: "reel" as const, title: "Test Reel Video", date: "2026-09-15" },
      { type: "trial_reel" as const, title: "Test Trial Reel Concept", date: "2026-09-18" },
    ];

    for (const spec of testTypes) {
      const res: any = await createContentItemAction({
        actorUserId: founderId,
        projectId: projectId,
        title: spec.title,
        platform: "Instagram",
        contentType: spec.type,
        scheduledPublicationDate: spec.date,
        submissionDeadline: spec.date,
        accountableOwnerId: founderId,
      });

      expect(res.success).toBe(true);
      expect(res.item).toBeDefined();
      cleanupItemIds.push(res.item.id);

      // Verify PostgreSQL commit
      const [itemInDb] = await db.select().from(contentItems).where(eq(contentItems.id, res.item.id)).limit(1);
      expect(itemInDb).toBeDefined();
      expect(itemInDb.contentType).toBe(spec.type);
      expect(itemInDb.scheduledPublicationDate).toBeDefined();
      expect(itemInDb.scheduledPublicationDate?.toISOString().startsWith(spec.date)).toBe(true);

      // Verify Authoritative Workspace State hydration for Calendar
      const workspaceRes = await getAuthoritativeWorkspaceStateAction(founderId);
      expect(workspaceRes.success).toBe(true);
      const hydratedItem = workspaceRes.state.contentItems.find((i) => i.id === res.item.id);
      expect(hydratedItem).toBeDefined();
      expect(hydratedItem?.deadlines?.scheduledPublicationDate?.startsWith(spec.date)).toBe(true);
      expect(hydratedItem?.accountableOwnerId).toBe(founderId);
    }
  });

  it("proves multi-platform creation populates separate ContentItem rows with respective platform dates", { timeout: 30000 }, async () => {
    const multiRes: any = await createContentGroupAction({
      actorUserId: founderId,
      projectId: projectId,
      title: "Omnichannel Spring Launch",
      platforms: [
        {
          platform: "Instagram",
          contentType: "carousel",
          scheduledPublicationDate: "2026-09-20",
          submissionDeadline: "2026-09-18",
          accountableOwnerId: founderId,
        },
        {
          platform: "LinkedIn",
          contentType: "post",
          scheduledPublicationDate: "2026-09-21",
          submissionDeadline: "2026-09-19",
          accountableOwnerId: founderId,
        },
        {
          platform: "YouTube",
          contentType: "reel",
          scheduledPublicationDate: "2026-09-22",
          submissionDeadline: "2026-09-20",
          accountableOwnerId: founderId,
        },
      ],
      sharedInitialCopy: {
        caption: "Spring collection launch across all channels",
        hashtags: ["spring", "launch"],
        cta: "Visit site",
      },
    });

    expect(multiRes.success).toBe(true);
    expect(multiRes.group).toBeDefined();
    expect(multiRes.items?.length).toBe(3);
    cleanupGroupIds.push(multiRes.group.id);
    multiRes.items.forEach((i: { id: string }) => cleanupItemIds.push(i.id));

    // Verify all 3 child items in Neon PostgreSQL
    const itemsInDb = await db.select().from(contentItems).where(eq(contentItems.contentGroupId, multiRes.group.id));
    expect(itemsInDb.length).toBe(3);

    const igItem = itemsInDb.find((i) => i.platform === "Instagram");
    const liItem = itemsInDb.find((i) => i.platform === "LinkedIn");
    const ytItem = itemsInDb.find((i) => i.platform === "YouTube");

    expect(igItem?.scheduledPublicationDate?.toISOString().startsWith("2026-09-20")).toBe(true);
    expect(liItem?.scheduledPublicationDate?.toISOString().startsWith("2026-09-21")).toBe(true);
    expect(ytItem?.scheduledPublicationDate?.toISOString().startsWith("2026-09-22")).toBe(true);

    // Verify cross-session authoritative fetch
    const secondSessionState = await getAuthoritativeWorkspaceStateAction(founderId);
    const hydratedGroup = secondSessionState.state.contentGroups.find((g) => g.id === multiRes.group.id);
    expect(hydratedGroup).toBeDefined();
    expect(hydratedGroup?.contentItemIds.length).toBe(3);
  });

  it("proves published item moves/resolves to published_at in calendar layer", { timeout: 30000 }, async () => {
    // 1. Create scheduled item
    const res: any = await createContentItemAction({
      actorUserId: founderId,
      projectId: projectId,
      title: "Live Resolution Test Item",
      platform: "Instagram",
      contentType: "post",
      scheduledPublicationDate: "2026-09-25",
    });
    expect(res.success).toBe(true);
    cleanupItemIds.push(res.item.id);

    // 2. Mark published with actual date
    const actualLiveDate = "2026-09-24T14:30:00.000Z";
    const pubRes: any = await markContentPublishedAction({
      actorUserId: founderId,
      contentItemId: res.item.id,
      liveUrl: "https://instagram.com/p/live-123",
      publishedAt: actualLiveDate,
    });
    expect(pubRes.success).toBe(true);

    // 3. Hydrate state and verify resolution
    const ws = await getAuthoritativeWorkspaceStateAction(founderId);
    const item = ws.state.contentItems.find((i) => i.id === res.item.id);
    expect(item?.stage).toBe("published");
    expect(item?.publishedAt).toBe(actualLiveDate);
    expect(item?.liveUrl).toBe("https://instagram.com/p/live-123");
  });

  it("proves unscheduled item is retained and accessible with null date", { timeout: 30000 }, async () => {
    // Create item with no scheduled date
    const res: any = await createContentItemAction({
      actorUserId: founderId,
      projectId: projectId,
      title: "Unscheduled Backlog Item",
      platform: "Facebook",
      contentType: "post",
    });
    expect(res.success).toBe(true);
    cleanupItemIds.push(res.item.id);

    const ws = await getAuthoritativeWorkspaceStateAction(founderId);
    const item = ws.state.contentItems.find((i) => i.id === res.item.id);
    expect(item).toBeDefined();
    expect(item?.deadlines?.scheduledPublicationDate).toBeUndefined();
    expect(item?.title).toBe("Unscheduled Backlog Item");
  });

  it("proves draft items do not appear in review queue, but submitted items do", { timeout: 30000 }, async () => {
    // 1. Create Draft item
    const draftRes: any = await createContentItemAction({
      actorUserId: founderId,
      projectId: projectId,
      title: "Draft Not In Queue",
      platform: "Instagram",
      contentType: "reel",
    });
    expect(draftRes.success).toBe(true);
    cleanupItemIds.push(draftRes.item.id);

    // Verify stage is draft
    expect(draftRes.item.stage).toBe("draft");

    // 2. Submit version to advance to in_review
    const submitRes: any = await submitVersionAction({
      actorUserId: founderId,
      submissionVersionId: draftRes.version.id,
    });
    expect(submitRes.success).toBe(true);
    expect(submitRes.item?.stage).toBe("in_review");

    // 3. Hydrate state and verify stage
    const ws = await getAuthoritativeWorkspaceStateAction(founderId);
    const item = ws.state.contentItems.find((i) => i.id === draftRes.item.id);
    expect(item?.stage).toBe("in_review");
  });
});
