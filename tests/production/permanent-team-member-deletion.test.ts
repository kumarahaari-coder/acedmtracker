import { describe, it, expect, beforeEach } from "vitest";
import dotenv from "dotenv";
dotenv.config({ path: ".env.production.local" });

import { createTeamMemberAction, permanentlyDeleteTeamMemberAction } from "@/lib/actions/team";
import { createProjectAction, addProjectMemberAction } from "@/lib/actions/projects";
import { getAuthoritativeUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users, contentAssignments, workSessions, projects, contentItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

describe("Permanent Team Member Deletion Architecture & Safeguards", () => {
  const orgId = "7af122b1-9de9-4f26-bab3-4a7537eecdf7";
  let founderUserId: string;
  let adminUserId: string;
  let consultantUserId: string;
  let designerUserId: string;

  beforeEach(async () => {
    // 1. Find or provision active founder
    const [founder] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);

    if (founder) {
      founderUserId = founder.id;
    } else {
      const created = await createTeamMemberAction({
        fullName: `Founder Test ${Date.now()}`,
        email: `founder_${Date.now()}@aceassured.com`,
        role: "founder",
      });
      founderUserId = created.user!.id;
    }

    // 2. Provision admin
    const adminRes = await createTeamMemberAction({
      fullName: `Admin Test ${Date.now()}`,
      email: `admin_${Date.now()}@aceassured.com`,
      role: "admin",
    });
    adminUserId = adminRes.user!.id;

    // 3. Provision consultant
    const consultantRes = await createTeamMemberAction({
      fullName: `Consultant Test ${Date.now()}`,
      email: `consultant_${Date.now()}@aceassured.com`,
      role: "consultant",
    });
    consultantUserId = consultantRes.user!.id;

    // 4. Provision designer
    const designerRes = await createTeamMemberAction({
      fullName: `Designer Test ${Date.now()}`,
      email: `designer_${Date.now()}@aceassured.com`,
      role: "designer",
    });
    designerUserId = designerRes.user!.id;
  });

  it("allows Founder to permanently hard-delete an unused Team Member (Case A)", async () => {
    const freshUser = await createTeamMemberAction({
      fullName: "Unused Designer",
      email: `unused_${Date.now()}@aceassured.com`,
      role: "designer",
    });
    const targetUserId = freshUser.user!.id;

    const res = await permanentlyDeleteTeamMemberAction({
      userId: targetUserId,
      actorUserId: founderUserId,
      reason: "Account created in error",
    });

    expect(res.success).toBe(true);
    expect(res.strategy).toBe("hard_delete");

    // Verify row physically deleted from PostgreSQL users
    const [check] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    expect(check).toBeUndefined();
  });

  it("allows Admin to permanently delete an unused Team Member", async () => {
    const freshUser = await createTeamMemberAction({
      fullName: "Unused Temp",
      email: `unused_admin_${Date.now()}@aceassured.com`,
      role: "designer",
    });
    const targetUserId = freshUser.user!.id;

    const res = await permanentlyDeleteTeamMemberAction({
      userId: targetUserId,
      actorUserId: adminUserId,
      reason: "Admin cleanup",
    });

    expect(res.success).toBe(true);
    expect(res.strategy).toBe("hard_delete");
  });

  it("denies Consultant attempts to permanently delete a Team Member", async () => {
    const res = await permanentlyDeleteTeamMemberAction({
      userId: designerUserId,
      actorUserId: consultantUserId,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Only Founders and Admins");
  });

  it("denies Designer attempts to permanently delete a Team Member", async () => {
    const res = await permanentlyDeleteTeamMemberAction({
      userId: consultantUserId,
      actorUserId: designerUserId,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Only Founders and Admins");
  });

  it("blocks user from deleting themselves while logged in", async () => {
    const res = await permanentlyDeleteTeamMemberAction({
      userId: founderUserId,
      actorUserId: founderUserId,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("cannot delete your own active account");
  });

  it("blocks deletion of the last active Founder in the organization", async () => {
    const founderCount = await db.select().from(users).where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")));
    if (founderCount.length <= 1) {
      const res = await permanentlyDeleteTeamMemberAction({
        userId: founderUserId,
        actorUserId: adminUserId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot delete the last active Founder");
    }
  });

  it("performs controlled anonymized tombstone when historical business activity exists (Case B)", async () => {
    // 1. Create a designer
    const targetMember = await createTeamMemberAction({
      fullName: "Historical Designer",
      email: `historical_${Date.now()}@aceassured.com`,
      role: "designer",
    });
    const targetUserId = targetMember.user!.id;

    // 2. Create project and content item
    const projRes = await createProjectAction({
      name: "History Project",
      clientBrand: "History Client",
    });
    const projectId = projRes.project!.id;

    const [item] = await db
      .insert(contentItems)
      .values({
        orgId,
        projectId,
        title: "Test Reel",
        platform: "Instagram",
        contentType: "reel",
        stage: "draft",
      })
      .returning();

    const [assignment] = await db
      .insert(contentAssignments)
      .values({
        orgId,
        projectId,
        contentItemId: item.id,
        assigneeUserId: targetUserId,
        assignedByUserId: founderUserId,
        assignmentRole: "designer",
        status: "assigned",
        initialDueAt: new Date(),
        currentDueAt: new Date(),
      })
      .returning();

    // 3. Insert historical work session
    await db.insert(workSessions).values({
      orgId,
      projectId,
      contentItemId: item.id,
      assignmentId: assignment.id,
      userId: targetUserId,
      startedAt: new Date(),
      accumulatedSeconds: 3600,
      status: "completed",
    });

    // 4. Delete member
    const deleteRes = await permanentlyDeleteTeamMemberAction({
      userId: targetUserId,
      actorUserId: founderUserId,
      reason: "GDPR Anonymization Request",
    });

    expect(deleteRes.success).toBe(true);
    expect(deleteRes.strategy).toBe("tombstone");

    // 5. Verify user record is anonymized and tombstoned
    const [tombstonedUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    expect(tombstonedUser).toBeDefined();
    expect(tombstonedUser.fullName).toBe("Deleted User");
    expect(tombstonedUser.status).toBe("deleted");
    expect(tombstonedUser.email).toContain("@deleted.local");
    expect(tombstonedUser.authUserId).toBeNull();
    expect(tombstonedUser.deletedAt).toBeDefined();

    // 6. Verify historical work sessions remain intact with same user ID
    const [savedSession] = await db.select().from(workSessions).where(eq(workSessions.userId, targetUserId)).limit(1);
    expect(savedSession).toBeDefined();
    expect(savedSession.accumulatedSeconds).toBe(3600);
  });

  it("immediately denies access on next protected request if user is deleted while session is active", async () => {
    // 1. Create active designer with simulated auth linkage
    const targetEmail = `active_session_${Date.now()}@aceassured.com`;
    const memberRes = await createTeamMemberAction({
      fullName: "Logged In User",
      email: targetEmail,
      role: "designer",
    });
    const targetUserId = memberRes.user!.id;

    // 2. Simulate active session: user resolves as active
    const activeAuthUser = await getAuthoritativeUser(targetUserId);
    expect(activeAuthUser).not.toBeNull();
    expect(activeAuthUser?.status).toBe("active");

    // 3. Founder permanently deletes user in PostgreSQL
    const deleteRes = await permanentlyDeleteTeamMemberAction({
      userId: targetUserId,
      actorUserId: founderUserId,
      reason: "Revoked credentials",
    });
    expect(deleteRes.success).toBe(true);

    // 4. On next protected request (navigation / state refresh / server action):
    // Authoritative check must return null and deny access immediately
    const postDeletionUser = await getAuthoritativeUser(targetUserId);
    expect(postDeletionUser).toBeNull();

    // 5. Subsequent attempts to perform any protected action must be rejected immediately
    const actionAttempt = await permanentlyDeleteTeamMemberAction({
      userId: consultantUserId,
      actorUserId: targetUserId,
    });
    expect(actionAttempt.success).toBe(false);
    expect(actionAttempt.error).toContain("Unauthorized: Could not resolve authenticated actor");
  });
});
