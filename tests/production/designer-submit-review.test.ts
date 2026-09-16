import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { contentItems, contentAssignments, users, submissionVersions } from "../../lib/db/schema";
import { updateContentItemStageAction } from "../../lib/actions/content";
import { eq } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST E — Designer Submit for Review Workflow & Security", () => {
  let designerUser: any;
  let otherDesigner: any;
  let testItem: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    const designers = activeUsers.filter((u) => u.organizationRole === "designer");
    designerUser = designers[0] || activeUsers[0];
    otherDesigner = designers[1] || activeUsers[1] || designers[0];

    const [item] = await db.select().from(contentItems).where(eq(contentItems.orgId, designerUser.orgId)).limit(1);
    testItem = item;

    // Ensure item is assigned to designerUser
    await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, testItem.id));
    await db.insert(contentAssignments).values({
      id: crypto.randomUUID(),
      orgId: designerUser.orgId,
      projectId: testItem.projectId,
      contentItemId: testItem.id,
      assigneeUserId: designerUser.id,
      assignedByUserId: designerUser.id,
      assignmentRole: "designer",
      status: "assigned",
      initialDueAt: new Date(),
      currentDueAt: new Date(),
    });

    // Ensure item has a submitted version to satisfy invariant
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
        legacyId: `ver_${Date.now()}`,
        contentItemId: testItem.id,
        projectId: testItem.projectId,
        orgId: designerUser.orgId,
        versionNumber: 1,
        isDraft: false,
        submittedAt: new Date(),
        caption: "Test",
        hashtags: [],
        cta: "",
        copyFingerprint: "fp_test",
        creativeFingerprint: "fp_test",
        postingDateFingerprint: "fp_test",
        createdByUserId: designerUser.id,
      });
    }
  });

  it("1. Designer can submit draft deliverable assigned to self", async () => {
    await db.update(contentItems).set({ stage: "draft" }).where(eq(contentItems.id, testItem.id));

    const res = await updateContentItemStageAction({
      actorUserId: designerUser.id,
      contentItemId: testItem.id,
      stage: "submitted",
    });

    if (!res.success) {
      console.log("DEBUG test 1 error:", res.error);
    }
    expect(res.success).toBe(true);

    const [dbItem] = await db.select().from(contentItems).where(eq(contentItems.id, testItem.id));
    expect(dbItem.stage).toBe("submitted");
  });

  it("2. Designer CANNOT submit another designer's unassigned deliverable", async () => {
    if (otherDesigner.id === designerUser.id) return;

    // Remove assignment for otherDesigner
    await db.update(contentItems).set({ stage: "draft" }).where(eq(contentItems.id, testItem.id));

    const res = await updateContentItemStageAction({
      actorUserId: otherDesigner.id,
      contentItemId: testItem.id,
      stage: "submitted",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Unauthorized");
  });
});
