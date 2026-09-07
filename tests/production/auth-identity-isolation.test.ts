import { describe, it, expect } from "vitest";
import { getAuthoritativeUser } from "@/lib/auth/session";
import { getAuthoritativeLayoutContextAction, getAuthoritativeWorkspaceStateAction } from "@/lib/actions/workspace";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

describe("Security Regression — Identity Isolation & Fallback Prevention", () => {
  it("Invariant 1: Unauthenticated context returns null and never resolves to Founder", async () => {
    // Calling getAuthoritativeUser() with no arguments in a clean context (no auth session)
    const user = await getAuthoritativeUser();
    expect(user).toBeNull();
  });

  it("Invariant 2: Unknown or unprovisioned user ID returns null and never resolves to Founder", async () => {
    const unknownUuid = "00000000-0000-0000-0000-000000000000";
    const user = await getAuthoritativeUser(unknownUuid);
    expect(user).toBeNull();

    const randomLegacyId = "unknown_user_random_123";
    const legacyUser = await getAuthoritativeUser(randomLegacyId);
    expect(legacyUser).toBeNull();
  });

  it("Invariant 3: Distinct provisioned users resolve to distinct identities (aceUserA != aceUserB)", async () => {
    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    expect(activeUsers.length).toBeGreaterThanOrEqual(2);

    const userA = activeUsers[0];
    const userB = activeUsers[1];

    const resolvedA = await getAuthoritativeUser(userA.id);
    const resolvedB = await getAuthoritativeUser(userB.id);

    expect(resolvedA).not.toBeNull();
    expect(resolvedB).not.toBeNull();
    expect(resolvedA!.id).toBe(userA.id);
    expect(resolvedB!.id).toBe(userB.id);
    expect(resolvedA!.id).not.toBe(resolvedB!.id);
    expect(resolvedA!.email).not.toBe(resolvedB!.email);

    const founder = activeUsers.find((u) => u.organizationRole === "founder");
    const nonFounder = activeUsers.find((u) => u.organizationRole !== "founder");
    if (founder && nonFounder) {
      const resFounder = await getAuthoritativeUser(founder.id);
      const resNonFounder = await getAuthoritativeUser(nonFounder.id);
      expect(resFounder).not.toBeNull();
      expect(resNonFounder).not.toBeNull();
      expect(resFounder!.id).not.toBe(resNonFounder!.id);
      expect(resFounder!.organizationRole).toBe("founder");
      expect(resNonFounder!.organizationRole).not.toBe("founder");
    }
  });

  it("Invariant 4: Layout and workspace actions return null user when unauthenticated", async () => {
    const layoutContext = await getAuthoritativeLayoutContextAction();
    expect(layoutContext.success).toBe(true);
    expect(layoutContext.context?.user).toBeNull();

    const workspaceState = await getAuthoritativeWorkspaceStateAction();
    // In unauthenticated context with no actor, it returns unauthorized
    expect(workspaceState.success).toBe(false);
    expect(workspaceState.user).toBeNull();
  });

  it("Contract Test: lib/auth/session.ts contains ZERO founder/default fallbacks", () => {
    const sessionFile = fs.readFileSync(
      path.join(process.cwd(), "lib/auth/session.ts"),
      "utf-8"
    );

    // No firstFounder identifier
    expect(sessionFile).not.toContain("firstFounder");

    // No queries filtering by organizationRole === 'founder' to pick a default user
    expect(sessionFile).not.toMatch(/organizationRole.*['"]founder['"].*limit\(1\)/i);
    expect(sessionFile).not.toMatch(/eq\(users\.organizationRole,\s*['"]founder['"]\)/i);

    // No string role matching fallbacks (e.g. userId.includes('founder'))
    expect(sessionFile).not.toContain("userId.includes(\"founder\")");
  });

  it("Contract Test: lib/actions/workspace.ts contains ZERO founder/default fallbacks", () => {
    const workspaceFile = fs.readFileSync(
      path.join(process.cwd(), "lib/actions/workspace.ts"),
      "utf-8"
    );

    // No firstFounder or firstOrg fallbacks
    expect(workspaceFile).not.toContain("firstFounder");
    expect(workspaceFile).not.toContain("firstOrg");

    // No fallback to founder role when user is missing
    expect(workspaceFile).not.toContain("|| \"founder\"");
  });

  it("Contract Test: app/(dashboard)/layout.tsx does not default missing role to founder", () => {
    const layoutFile = fs.readFileSync(
      path.join(process.cwd(), "app/(dashboard)/layout.tsx"),
      "utf-8"
    );

    expect(layoutFile).not.toContain("organizationRole as any) || \"founder\"");
  });
});
