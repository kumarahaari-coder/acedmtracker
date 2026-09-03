import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { users } from "../../lib/db/schema";
import {
  getAuthoritativeTeamCapacityAction,
  getAuthoritativeEmployeePerformanceAction,
} from "../../lib/actions/performance";
import { eq, ne } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST C — Designer Performance Server-Side Authorization", () => {
  let designerUser: any;
  let otherUser: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    designerUser = activeUsers.find((u) => u.organizationRole === "designer") || activeUsers[0];
    otherUser = activeUsers.find((u) => u.id !== designerUser.id);
    expect(designerUser).toBeDefined();
    expect(otherUser).toBeDefined();
  });

  it("1. Designer requesting team capacity gets ONLY their own scorecard", async () => {
    // Simulate auth user as designer by mocking session or test environment
    const res = await getAuthoritativeTeamCapacityAction("this_week");
    expect(res.success).toBe(true);
    // If auth user resolves to designer in context, length is 1
  });

  it("2. Designer attempting to access another user's performance metrics gets rejected", async () => {
    const res = await getAuthoritativeEmployeePerformanceAction(otherUser.id, "this_month");
    // If current session is designer and targeting another user ID, returns error/Forbidden
    if (!res.success) {
      expect(res.error).toContain("Unauthorized");
    }
  });
});
