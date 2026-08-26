"use server";

import { db } from "../db";
import { users, projectMemberships, projects } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { resolveProjectId, resolveUserId } from "../compat/resolver";
import { invalidateWorkspaceEntities } from "./revalidation";

export async function addClientToProjectAction(params: {
  name: string;
  email: string;
  jobTitle?: string;
  phone?: string;
  projectId: string;
  actorUserId?: string;
}): Promise<{
  success: boolean;
  user?: {
    id: string;
    email: string;
    fullName: string;
    organizationRole: string;
    status: string;
    jobTitle?: string;
    avatar?: string;
    createdAt: string;
  };
  membership?: {
    id: string;
    projectId: string;
    userId: string;
    membershipRole: string;
    status: string;
    assignedAt: string;
  };
  error?: string;
}> {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim();

    if (!cleanEmail || !cleanName) {
      return { success: false, error: "Client name and email are required." };
    }

    // 1. Resolve Actor and verify permissions
    let orgId = "";
    if (params.actorUserId) {
      const actor = await getAuthoritativeUser(params.actorUserId);
      if (actor) {
        orgId = actor.orgId;
        if (actor.organizationRole === "designer" || actor.organizationRole === "client") {
          return {
            success: false,
            error: "Unauthorized: Designers and Clients cannot manage Client accounts.",
          };
        }
      }
    }

    // 2. Resolve Canonical Project ID
    const canonicalProjectId = await resolveProjectId(params.projectId);
    if (!canonicalProjectId) {
      return { success: false, error: "Project not found in database." };
    }

    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, canonicalProjectId))
      .limit(1);

    if (!proj) {
      return { success: false, error: "Project record not found." };
    }

    if (!orgId) {
      orgId = proj.orgId;
    }

    // 3. Check for existing user by normalized email
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.normalizedEmail, cleanEmail))
      .limit(1);

    let clientUserId: string;
    let clientUserData: any;

    if (existingUser) {
      if (existingUser.organizationRole !== "client") {
        return {
          success: false,
          error: `Email '${params.email}' is already an internal team member (${existingUser.organizationRole}). Internal staff cannot be assigned as clients.`,
        };
      }
      clientUserId = existingUser.id;
      clientUserData = existingUser;

      // Ensure user status is active
      if (existingUser.status !== "active") {
        const [updated] = await db
          .update(users)
          .set({ status: "active", updatedAt: sql`NOW()` })
          .where(eq(users.id, existingUser.id))
          .returning();
        clientUserData = updated;
      }
    } else {
      // Create new client user record in PostgreSQL
      const [created] = await db
        .insert(users)
        .values({
          orgId,
          email: params.email.trim(),
          normalizedEmail: cleanEmail,
          fullName: cleanName,
          organizationRole: "client",
          status: "active",
        })
        .returning();

      clientUserId = created.id;
      clientUserData = created;
    }

    // 4. Insert or Reactivate Project Membership
    const [membership] = await db
      .insert(projectMemberships)
      .values({
        projectId: canonicalProjectId,
        userId: clientUserId,
        orgId,
        membershipRole: "client",
        status: "active",
      })
      .onConflictDoUpdate({
        target: [projectMemberships.projectId, projectMemberships.userId],
        set: {
          status: "active",
          membershipRole: "client",
          revokedAt: null,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();

    // 5. Invalidate caches across related tags and paths
    await invalidateWorkspaceEntities({
      orgId,
      projectId: canonicalProjectId,
      userId: clientUserId,
    });

    const nowIso = new Date().toISOString();

    return {
      success: true,
      user: {
        id: clientUserData.id,
        email: clientUserData.email,
        fullName: clientUserData.fullName,
        organizationRole: clientUserData.organizationRole,
        status: clientUserData.status,
        jobTitle: params.jobTitle || "Client Contact",
        avatar: clientUserData.avatarUrl || cleanName.slice(0, 2).toUpperCase() || "C",
        createdAt: clientUserData.createdAt ? clientUserData.createdAt.toISOString() : nowIso,
      },
      membership: {
        id: membership.id,
        projectId: params.projectId, // preserve input legacy/UUID for UI mapping
        userId: clientUserId,
        membershipRole: membership.membershipRole,
        status: membership.status,
        assignedAt: membership.assignedAt ? membership.assignedAt.toISOString() : nowIso,
      },
    };
  } catch (err: any) {
    console.error("[addClientToProjectAction] Database failure:", err);
    return { success: false, error: err.message || "Failed to add client to database." };
  }
}

export async function removeClientFromProjectAction(params: {
  projectId: string;
  userId: string;
  actorUserId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const canonicalProjectId = await resolveProjectId(params.projectId);
    if (!canonicalProjectId) return { success: false, error: "Project not found." };

    const canonicalUserId = await resolveUserId(params.userId);
    if (!canonicalUserId) return { success: false, error: "Client user not found." };

    await db
      .update(projectMemberships)
      .set({
        status: "revoked",
        revokedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(projectMemberships.projectId, canonicalProjectId),
          eq(projectMemberships.userId, canonicalUserId)
        )
      );

    await invalidateWorkspaceEntities({
      projectId: canonicalProjectId,
      userId: canonicalUserId,
    });

    return { success: true };
  } catch (err: any) {
    console.error("[removeClientFromProjectAction] Database failure:", err);
    return { success: false, error: err.message || "Failed to revoke client access." };
  }
}
