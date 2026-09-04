import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { contentItems, contentAssignments, projects, users, submissionVersions } from "../../lib/db/schema";
import { updateContentItemStageAction } from "../../lib/actions/content";
import { getAuthoritativeWorkspaceStateAction } from "../../lib/actions/workspace";
import { eq } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST B — Kanban Workflow Stage Persistence & Validation", () => {
  let founderUser: any;
  let designerUser: any;
  let testItem: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder") || activeUsers[0];
    designerUser = activeUsers.find((u) => u.organizationRole === "designer") || activeUsers[1];
    expect(founderUser).toBeDefined();

    const [item] = await db.select().from(contentItems).where(eq(contentItems.orgId, founderUser.orgId)).limit(1);
    expect(item).toBeDefined();
    testItem = item;

    // Invariant requirement: item must have an immutable submitted version to transition to submitted/in_review
    const [existingVer] = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.contentItemId, testItem.id))
      .limit(1);

    if (existingVer) {
      await db
        .update(submissionVersions)
        .set({ isDraft: false, submittedAt: new Date() })
        .where(eq(submissionVersions.id, existingVer.id));
    } else {
      await db.insert(submissionVersions).values({
        id: crypto.randomUUID(),
        orgId: founderUser.orgId,
        projectId: testItem.projectId,
        contentItemId: testItem.id,
        versionNumber: 1,
        isDraft: false,
        submittedAt: new Date(),
        createdByUserId: founderUser.id,
      });
    }
  });

  it("1. Legal transition (draft -> submitted) updates content_items.stage in PostgreSQL", async () => {
    // Reset to draft
    await db.update(contentItems).set({ stage: "draft" }).where(eq(contentItems.id, testItem.id));

    const res = await updateContentItemStageAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      stage: "submitted",
    });

    expect(res.success).toBe(true);
    expect(res.item.stage).toBe("submitted");

    // Verify DB
    const [dbItem] = await db.select().from(contentItems).where(eq(contentItems.id, testItem.id));
    expect(dbItem.stage).toBe("submitted");
  });

  it("2. Workspace hydration returns updated stage after navigation/refresh", async () => {
    const ws = await getAuthoritativeWorkspaceStateAction(founderUser.id);
    expect(ws.success).toBe(true);

    const hydratedItem = ws.state.contentItems.find((i) => i.id === testItem.id);
    expect(hydratedItem?.stage).toBe("submitted");
  });

  it("3. Illegal transition for designer role gets rejected", async () => {
    if (!designerUser) return;

    // Ensure item is assigned to designerUser
    await db
      .insert(contentAssignments)
      .values({
        id: crypto.randomUUID(),
        orgId: designerUser.orgId,
        projectId: testItem.projectId,
        contentItemId: testItem.id,
        assigneeUserId: designerUser.id,
        assignedByUserId: founderUser.id,
        assignmentRole: "designer",
        status: "assigned",
        initialDueAt: new Date(),
        currentDueAt: new Date(),
      })
      .onConflictDoNothing();

    // Reset to draft
    await db.update(contentItems).set({ stage: "draft" }).where(eq(contentItems.id, testItem.id));

    // Designer trying to jump draft -> published
    const res = await updateContentItemStageAction({
      actorUserId: designerUser.id,
      contentItemId: testItem.id,
      stage: "published",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("4. Founder override allows stage change", async () => {
    // Founder override draft -> in_review directly
    const res = await updateContentItemStageAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      stage: "in_review",
    });

    expect(res.success).toBe(true);
    expect(res.item.stage).toBe("in_review");
  });
});
