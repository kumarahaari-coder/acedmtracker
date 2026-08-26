"use server";

import { db } from "../db";
import {
  users,
  projectMemberships,
  contentAssignments,
  workSessions,
  attendanceRecords,
  submissionVersions,
  approvalDecisions,
  founderOverrides,
  changeRequests,
  comments,
} from "../db/schema";
import { eq, and, ne, or, sql } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { OrganizationRole, UserStatus } from "../db/schema/users";
import { invalidateWorkspaceEntities } from "./revalidation";
import { resolveUserId } from "../compat/resolver";

export async function createTeamMemberAction(params: {
  fullName: string;
  email: string;
  role: OrganizationRole;
  actorUserId?: string;
}): Promise<{
  success: boolean;
  user?: {
    id: string;
    email: string;
    fullName: string;
    organizationRole: string;
    status: string;
    createdAt: string;
  };
  error?: string;
}> {
  try {
    const normalizedEmail = params.email.toLowerCase().trim();

    let orgId = "";
    if (params.actorUserId) {
      const actor = await getAuthoritativeUser(params.actorUserId);
      if (actor) orgId = actor.orgId;
    }

    if (!orgId) {
      const [firstUser] = await db.select().from(users).limit(1);
      if (firstUser) orgId = firstUser.orgId;
    }

    if (!orgId) {
      return { success: false, error: "Organization context not found." };
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.normalizedEmail, normalizedEmail))
      .limit(1);

    if (existing) {
      return {
        success: false,
        error: `A team member with email '${params.email}' is already provisioned.`,
      };
    }

    const [created] = await db
      .insert(users)
      .values({
        orgId,
        email: params.email.trim(),
        normalizedEmail,
        fullName: params.fullName.trim(),
        organizationRole: params.role,
        status: "active",
      })
      .returning();

    await invalidateWorkspaceEntities({
      orgId,
      userId: created.id,
      paths: ["/team", "/projects", "/performance"],
    });

    return {
      success: true,
      user: {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        organizationRole: created.organizationRole,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (err: any) {
    console.error("Failed to create team member in database:", err);
    return { success: false, error: err.message || "Failed to create team member." };
  }
}

export async function updateTeamMemberStatusAction(params: {
  userId: string;
  status: UserStatus;
  actorUserId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const canonicalUserId = (await resolveUserId(params.userId)) || params.userId;

    await db
      .update(users)
      .set({
        status: params.status,
        updatedAt: sql`NOW()`,
      })
      .where(eq(users.id, canonicalUserId));

    await invalidateWorkspaceEntities({
      userId: canonicalUserId,
      paths: ["/team", "/projects", "/performance"],
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to update team member status:", err);
    return { success: false, error: err.message || "Failed to update team member status." };
  }
}

export async function permanentlyDeleteTeamMemberAction(params: {
  userId: string;
  actorUserId?: string;
  reason?: string;
}): Promise<{
  success: boolean;
  strategy?: "hard_delete" | "tombstone";
  error?: string;
}> {
  try {
    const canonicalUserId = (await resolveUserId(params.userId)) || params.userId;

    // 1. Authorize Actor
    let actor: any = null;
    if (params.actorUserId) {
      actor = await getAuthoritativeUser(params.actorUserId);
    } else {
      try {
        const { auth } = await import("../../auth");
        const session = await auth();
        if (session?.user?.email) {
          const [dbActor] = await db
            .select()
            .from(users)
            .where(eq(users.normalizedEmail, session.user.email.toLowerCase().trim()))
            .limit(1);
          actor = dbActor;
        }
      } catch (_) {}
    }

    if (!actor) {
      return {
        success: false,
        error: "Unauthorized: Could not resolve authenticated actor.",
      };
    }

    if (actor.organizationRole !== "founder" && actor.organizationRole !== "admin") {
      return {
        success: false,
        error: "Unauthorized: Only Founders and Admins can permanently delete team members.",
      };
    }

    // 2. Prevent Self-Deletion
    if (actor.id === canonicalUserId) {
      return {
        success: false,
        error: "You cannot delete your own active account while logged in.",
      };
    }

    // 3. Locate Target User
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, canonicalUserId))
      .limit(1);

    if (!targetUser) {
      return { success: false, error: "Team member not found in database." };
    }

    // 4. Cross-Organization Protection
    if (targetUser.orgId !== actor.orgId) {
      return {
        success: false,
        error: "Unauthorized: Cross-organization deletion is forbidden.",
      };
    }

    // 5. Last Founder Protection
    if (targetUser.organizationRole === "founder") {
      const [founderCountRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(
          and(
            eq(users.orgId, targetUser.orgId),
            eq(users.organizationRole, "founder"),
            ne(users.id, targetUser.id),
            ne(users.status, "deleted")
          )
        );

      if (Number(founderCountRes?.count || 0) === 0) {
        return {
          success: false,
          error: "Cannot delete the last active Founder of the organization.",
        };
      }
    }

    // 6. Check Historical Operational References
    const [assignmentsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentAssignments)
      .where(
        or(
          eq(contentAssignments.assigneeUserId, targetUser.id),
          eq(contentAssignments.assignedByUserId, targetUser.id)
        )
      );

    const [sessionsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workSessions)
      .where(eq(workSessions.userId, targetUser.id));

    const [attendanceCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.userId, targetUser.id));

    const [submissionsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissionVersions)
      .where(eq(submissionVersions.createdByUserId, targetUser.id));

    const [decisionsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(approvalDecisions)
      .where(
        or(
          eq(approvalDecisions.reviewerUserId, targetUser.id),
          eq(approvalDecisions.revokedByUserId, targetUser.id)
        )
      );

    const [overridesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(founderOverrides)
      .where(eq(founderOverrides.actorUserId, targetUser.id));

    const [changesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(changeRequests)
      .where(
        or(
          eq(changeRequests.reviewerUserId, targetUser.id),
          eq(changeRequests.resolvedByUserId, targetUser.id)
        )
      );

    const [commentsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(
        or(
          eq(comments.authorUserId, targetUser.id),
          eq(comments.resolvedByUserId, targetUser.id)
        )
      );

    const hasHistory =
      Number(assignmentsCount?.count || 0) > 0 ||
      Number(sessionsCount?.count || 0) > 0 ||
      Number(attendanceCount?.count || 0) > 0 ||
      Number(submissionsCount?.count || 0) > 0 ||
      Number(decisionsCount?.count || 0) > 0 ||
      Number(overridesCount?.count || 0) > 0 ||
      Number(changesCount?.count || 0) > 0 ||
      Number(commentsCount?.count || 0) > 0;

    if (!hasHistory) {
      // Case A: No Historical References -> Physical Hard Delete
      await db
        .delete(projectMemberships)
        .where(
          or(
            eq(projectMemberships.userId, targetUser.id),
            eq(projectMemberships.assignedByUserId, targetUser.id)
          )
        );

      await db.delete(users).where(eq(users.id, targetUser.id));

      await invalidateWorkspaceEntities({
        orgId: targetUser.orgId,
        userId: targetUser.id,
        paths: ["/team", "/projects", "/performance"],
      });

      return { success: true, strategy: "hard_delete" };
    } else {
      // Case B: Historical References Exist -> Controlled Anonymized Tombstone
      await db
        .update(projectMemberships)
        .set({
          status: "revoked",
          revokedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(eq(projectMemberships.userId, targetUser.id));

      const tombstoneEmail = `deleted-user-${targetUser.id}@deleted.local`;

      await db
        .update(users)
        .set({
          fullName: "Deleted User",
          email: tombstoneEmail,
          normalizedEmail: tombstoneEmail,
          avatarUrl: null,
          authUserId: null,
          status: "deleted",
          deletedAt: sql`NOW()`,
          deletedByUserId: actor.id,
          deletionReason: params.reason || "Permanently deleted by administrator",
          updatedAt: sql`NOW()`,
        })
        .where(eq(users.id, targetUser.id));

      await invalidateWorkspaceEntities({
        orgId: targetUser.orgId,
        userId: targetUser.id,
        paths: ["/team", "/projects", "/performance"],
      });

      return { success: true, strategy: "tombstone" };
    }
  } catch (err: any) {
    console.error("Failed to permanently delete team member:", err);
    return { success: false, error: err.message || "Failed to permanently delete team member." };
  }
}
