"use server";

import { db } from "../db";
import {
  users,
  authUsers,
  projectMemberships,
  contentAssignments,
  workSessions,
  attendanceRecords,
  submissionVersions,
  approvalDecisions,
  founderOverrides,
  changeRequests,
  comments,
  employeeCapacitySchedules,
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

      if (targetUser.authUserId) {
        await db.delete(authUsers).where(eq(authUsers.id, targetUser.authUserId));
      }

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

      if (targetUser.authUserId) {
        await db.delete(authUsers).where(eq(authUsers.id, targetUser.authUserId));
      }

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

/**
 * Role-Scoped Team Directory Action
 * Designers receive ONLY their own profile and activity.
 * Founders, Admins, Consultants receive full authorized organization team members.
 * Clients receive 403 Forbidden.
 */
export async function getAuthorizedTeamDirectoryAction(actorUserId?: string): Promise<{
  success: boolean;
  members: any[];
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) return { success: false, members: [], error: "Unauthorized" };

    const isDesigner = authUser.organizationRole === "designer";
    const isClient = authUser.organizationRole === "client";

    if (isClient) {
      return { success: false, members: [], error: "Forbidden: Clients do not have team directory access." };
    }

    if (isDesigner) {
      // Designers ONLY get their own user record / profile / workload info
      const [self] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, authUser.id), eq(users.orgId, authUser.orgId)))
        .limit(1);

      if (!self) return { success: false, members: [], error: "User profile not found." };

      return {
        success: true,
        members: [
          {
            id: self.id,
            fullName: self.fullName,
            email: self.email,
            organizationRole: self.organizationRole,
            status: self.status,
            avatarUrl: self.avatarUrl,
            createdAt: self.createdAt ? self.createdAt.toISOString() : new Date().toISOString(),
          },
        ],
      };
    }

    // Founders, Admins, Consultants get organization team members
    const allOrgMembers = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, authUser.orgId), ne(users.status, "deleted")));

    const mapped = allOrgMembers.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      organizationRole: u.organizationRole,
      status: u.status,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
    }));

    return { success: true, members: mapped };
  } catch (err: any) {
    return { success: false, members: [], error: err.message };
  }
}

/**
 * 5. Update Team Member Profile Action (Authoritative PostgreSQL Persistence)
 * Safely updates profile fields across users and employee_capacity_schedules.
 * Blocks login email edits for accounts already linked to Auth.js/Google.
 */
export async function updateTeamMemberAction(params: {
  actorUserId?: string;
  targetUserId: string;
  fullName?: string;
  email?: string;
  organizationRole?: OrganizationRole;
  status?: UserStatus;
  primaryFunction?: string;
  creativeEligibility?: "primary" | "backup" | "not_eligible";
  workingHoursPerDay?: number;
}): Promise<{
  success: boolean;
  user?: {
    id: string;
    fullName: string;
    email: string;
    organizationRole: string;
    status: string;
  };
  error?: string;
}> {
  try {
    const authUser = await getAuthoritativeUser(params.actorUserId);
    if (!authUser) return { success: false, error: "Unauthorized." };

    if (authUser.organizationRole !== "founder" && authUser.organizationRole !== "admin") {
      return { success: false, error: "Unauthorized: Only founders and admins can update team member profiles." };
    }

    const resolvedTargetId = await resolveUserId(params.targetUserId);
    if (!resolvedTargetId) return { success: false, error: "Team member not found." };

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, resolvedTargetId))
      .limit(1);

    if (!targetUser) return { success: false, error: "Team member not found." };
    if (targetUser.orgId !== authUser.orgId) return { success: false, error: "Unauthorized." };

    const userUpdates: Record<string, any> = { updatedAt: sql`NOW()` };

    if (params.fullName && params.fullName.trim()) {
      userUpdates.fullName = params.fullName.trim();
    }

    if (params.organizationRole) {
      userUpdates.organizationRole = params.organizationRole;
    }

    if (params.status) {
      userUpdates.status = params.status;
    }

    // Email / Auth.js Safeguard:
    // If target user already has a linked Auth.js OAuth identity (authUserId IS NOT NULL),
    // email changes are blocked to prevent breaking authentication.
    if (params.email && params.email.trim().toLowerCase() !== targetUser.normalizedEmail) {
      if (targetUser.authUserId) {
        return {
          success: false,
          error: "Login email cannot be changed because this account is already linked to a Google/OAuth identity.",
        };
      }

      const cleanEmail = params.email.trim();
      const normalizedEmail = cleanEmail.toLowerCase();

      // Validate email uniqueness across the platform
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.normalizedEmail, normalizedEmail), ne(users.id, targetUser.id)))
        .limit(1);

      if (existingUser) {
        return { success: false, error: "A team member with this email address already exists." };
      }

      userUpdates.email = cleanEmail;
      userUpdates.normalizedEmail = normalizedEmail;
    }

    const [updatedUser] = await db
      .update(users)
      .set(userUpdates)
      .where(eq(users.id, targetUser.id))
      .returning();

    // Capacity schedule fields: primaryFunction, creativeEligibility, workingHoursPerDay
    const hasCapacityUpdates =
      params.primaryFunction !== undefined ||
      params.creativeEligibility !== undefined ||
      params.workingHoursPerDay !== undefined;

    if (hasCapacityUpdates) {
      const [currentSchedule] = await db
        .select()
        .from(employeeCapacitySchedules)
        .where(
          and(
            eq(employeeCapacitySchedules.userId, targetUser.id),
            sql`${employeeCapacitySchedules.effectiveTo} IS NULL`
          )
        )
        .limit(1);

      const hoursStr =
        params.workingHoursPerDay !== undefined
          ? Number(params.workingHoursPerDay).toFixed(2)
          : undefined;

      if (currentSchedule) {
        const scheduleUpdates: Record<string, any> = {};
        if (params.primaryFunction) scheduleUpdates.primaryFunction = params.primaryFunction;
        if (params.creativeEligibility) scheduleUpdates.creativeEligibility = params.creativeEligibility;
        if (hoursStr) {
          scheduleUpdates.mondayHours = hoursStr;
          scheduleUpdates.tuesdayHours = hoursStr;
          scheduleUpdates.wednesdayHours = hoursStr;
          scheduleUpdates.thursdayHours = hoursStr;
          scheduleUpdates.fridayHours = hoursStr;
        }

        if (Object.keys(scheduleUpdates).length > 0) {
          await db
            .update(employeeCapacitySchedules)
            .set(scheduleUpdates)
            .where(eq(employeeCapacitySchedules.id, currentSchedule.id));
        }
      } else {
        // Insert new active schedule
        await db.insert(employeeCapacitySchedules).values({
          orgId: targetUser.orgId,
          userId: targetUser.id,
          effectiveFrom: sql`CURRENT_DATE`,
          mondayHours: hoursStr || "8.00",
          tuesdayHours: hoursStr || "8.00",
          wednesdayHours: hoursStr || "8.00",
          thursdayHours: hoursStr || "8.00",
          fridayHours: hoursStr || "8.00",
          saturdayHours: "0.00",
          sundayHours: "0.00",
          primaryFunction: params.primaryFunction || "Creative",
          creativeEligibility: params.creativeEligibility || "primary",
        });
      }
    }

    await invalidateWorkspaceEntities({
      userId: authUser.id,
      orgId: authUser.orgId,
    });

    return {
      success: true,
      user: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        organizationRole: updatedUser.organizationRole,
        status: updatedUser.status,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
