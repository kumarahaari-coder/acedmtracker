import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { users } from "../../lib/db/schema";
import { getAuthorizedTeamDirectoryAction } from "../../lib/actions/team";
import { eq } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST B — Designer Team Server-Side Role Authorization", () => {
  let designerUser: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    designerUser = activeUsers.find((u) => u.organizationRole === "designer") || activeUsers[0];
    expect(designerUser).toBeDefined();
  });

  it("1. Designer team directory query returns ONLY self profile", async () => {
    const res = await getAuthorizedTeamDirectoryAction(designerUser.id);
    expect(res.success).toBe(true);
    expect(res.members.length).toBe(1);
    expect(res.members[0].id).toBe(designerUser.id);
  });

  it("2. Other team members are NOT exposed in server response for Designer", async () => {
    const res = await getAuthorizedTeamDirectoryAction(designerUser.id);
    const nonSelfMembers = res.members.filter((m) => m.id !== designerUser.id);
    expect(nonSelfMembers.length).toBe(0);
  });
});
