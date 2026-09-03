import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { contentItems, contentAssignments, users } from "../../lib/db/schema";
import { calculateEmployeeScorecard } from "../../lib/calculations/operationalEngine";
import { ACTIVE_ASSIGNMENT_STATUSES } from "../../lib/calculations/operationalEngine";
import { eq } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST D — Pre-Acceptance Assignment Visibility & Whitelist Enforcement", () => {
  let designerUser: any;
  let testItem: any;
  let testAssignment: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    designerUser = activeUsers.find((u) => u.organizationRole === "designer") || activeUsers[0];
    expect(designerUser).toBeDefined();

    const [item] = await db.select().from(contentItems).where(eq(contentItems.orgId, designerUser.orgId)).limit(1);
    testItem = item;

    const [asgn] = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.contentItemId, item.id))
      .limit(1);
    testAssignment = asgn;
  });

  it("1. ACTIVE_ASSIGNMENT_STATUSES whitelists assigned, accepted, in_progress", () => {
    expect(ACTIVE_ASSIGNMENT_STATUSES.has("assigned")).toBe(true);
    expect(ACTIVE_ASSIGNMENT_STATUSES.has("accepted")).toBe(true);
    expect(ACTIVE_ASSIGNMENT_STATUSES.has("in_progress")).toBe(true);
    expect(ACTIVE_ASSIGNMENT_STATUSES.has("reassigned")).toBe(false);
  });

  it("2. Task with status 'assigned' is immediately included in Employee Scorecard", async () => {
    const mockAssignment = {
      id: "asgn_test_assigned",
      orgId: designerUser.orgId,
      projectId: testItem.projectId,
      contentItemId: testItem.id,
      assigneeUserId: designerUser.id,
      assignedByUserId: designerUser.id,
      assignmentRole: "designer",
      status: "assigned",
      currentDueAt: new Date(),
    };

    const scorecard = calculateEmployeeScorecard(
      designerUser,
      { startDate: "2026-01-01", endDate: "2026-12-31", label: "Year" },
      [testItem],
      [mockAssignment as any],
      [],
      [],
      [],
      []
    );

    expect(scorecard.assignedTasks.length).toBeGreaterThanOrEqual(1);
  });
});
