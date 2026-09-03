import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { contentItems, contentAssignments, users } from "../../lib/db/schema";
import { rescheduleContentItemAction } from "../../lib/actions/content";
import { getAuthoritativeWorkspaceStateAction } from "../../lib/actions/workspace";
import { calculateInternalDeadline } from "../../lib/calculations/operationalEngine";
import { eq, and } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST A — Reschedule Propagation & Workday Deadline Recalculation", () => {
  let founderUser: any;
  let testItem: any;
  let testAssignment: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder") || activeUsers[0];
    expect(founderUser).toBeDefined();

    const [item] = await db.select().from(contentItems).where(eq(contentItems.orgId, founderUser.orgId)).limit(1);
    expect(item).toBeDefined();
    testItem = item;

    const [asgn] = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.contentItemId, item.id))
      .limit(1);
    testAssignment = asgn;
  });

  it("Reschedules deliverable publication date and recalculates operational internal deadline using workdays", async () => {
    const newPubDateStr = "2026-09-15T10:00:00.000Z"; // Tuesday, Sep 15

    const res = await rescheduleContentItemAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      scheduledPublicationDate: newPubDateStr,
    });

    expect(res.success).toBe(true);
    expect(res.item).toBeDefined();

    // Verify DB update on contentItems
    const [updatedDbItem] = await db.select().from(contentItems).where(eq(contentItems.id, testItem.id));
    expect(updatedDbItem.scheduledPublicationDate?.toISOString()).toContain("2026-09-15");

    // Internal deadline recalculation: Sep 15 (Tuesday) - 2 workdays = Sep 11 (Friday)
    const expectedInternalStr = "2026-09-11";
    const dbDeadlineStr = updatedDbItem.submissionDeadline
      ? updatedDbItem.submissionDeadline.toISOString().split("T")[0]
      : "";
    expect(dbDeadlineStr).toBe(expectedInternalStr);

    // Verify active assignment currentDueAt updated atomically
    if (testAssignment) {
      const [updatedAsgn] = await db
        .select()
        .from(contentAssignments)
        .where(eq(contentAssignments.id, testAssignment.id));
      const asgnDueStr = updatedAsgn.currentDueAt ? updatedAsgn.currentDueAt.toISOString().split("T")[0] : "";
      expect(asgnDueStr).toBe(expectedInternalStr);
    }
  });

  it("Hydrates rescheduled dates consistently in workspace state across views", async () => {
    const ws = await getAuthoritativeWorkspaceStateAction(founderUser.id);
    expect(ws.success).toBe(true);

    const hydratedItem = ws.state.contentItems.find((i) => i.id === testItem.id);
    expect(hydratedItem).toBeDefined();
    const schedDate = hydratedItem?.deadlines?.scheduledPublicationDate || (hydratedItem as any)?.scheduledPublicationDate;
    expect(schedDate).toContain("2026-09-15");
  });
});
