"use server";

import { db } from "../db";
import { projects, projectMemberships, users, organizations } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { resolveProjectId, resolveUserId } from "../compat/resolver";
import { MembershipRole } from "../db/schema/memberships";
import { ProjectEngagementModel } from "../types";
import { invalidateWorkspaceEntities } from "./revalidation";

export async function createProjectAction(params: {
  name: string;
  clientBrand: string;
  legacyId?: string;
  scope?: string;
  engagementModel?: ProjectEngagementModel;
  actorUserId?: string;
}): Promise<{
  success: boolean;
  project?: {
    id: string;
    legacyId: string | null;
    name: string;
    clientBrand: string;
    status: string;
    createdAt: string;
  };
  error?: string;
}> {
  try {
    let orgId = "";
    let actorId: string | null = null;

    if (params.actorUserId) {
      const actor = await getAuthoritativeUser(params.actorUserId);
      if (actor) {
        orgId = actor.orgId;
        actorId = actor.id;
      }
    }

    if (!orgId) {
      const [firstUser] = await db.select().from(users).limit(1);
      if (firstUser) {
        orgId = firstUser.orgId;
        if (!actorId) actorId = firstUser.id;
      }
    }

    if (!orgId) {
      const [org] = await db.select({ id: organizations.id }).from(organizations).limit(1);
      orgId = org?.id || "7af122b1-9de9-4f26-bab3-4a7537eecdf7";
    }

    const [created] = await db
      .insert(projects)
      .values({
        legacyId: params.legacyId || null,
        orgId,
        name: params.name.trim(),
        clientName: params.clientBrand.trim(),
        tier: "tier_1",
        engagementModel: params.engagementModel || "deliverable_based",
        status: "active",
      })
      .returning();

    // Automatically add creator to project memberships if internal
    if (actorId) {
      try {
        await db
          .insert(projectMemberships)
          .values({
            projectId: created.id,
            userId: actorId,
            orgId,
            membershipRole: "consultant",
            status: "active",
          })
          .onConflictDoNothing();
      } catch (memErr) {
        console.warn("Could not insert creator membership:", memErr);
      }
    }

    await invalidateWorkspaceEntities({
      orgId,
      projectId: created.id,
      paths: ["/", "/projects", "/team", "/performance"],
    });

    return {
      success: true,
      project: {
        id: created.id,
        legacyId: created.legacyId,
        name: created.name,
        clientBrand: created.clientName,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (err: any) {
    console.error("Failed to create project in database:", err);
    return { success: false, error: err.message || "Failed to create project." };
  }
}

export async function addProjectMemberAction(params: {
  projectId: string;
  userId: string;
  membershipRole?: string;
  actorUserId?: string;
}): Promise<{ success: boolean; membershipId?: string; error?: string }> {
  try {
    const canonicalProjectId = await resolveProjectId(params.projectId);
    if (!canonicalProjectId) {
      return { success: false, error: "Project not found in database." };
    }

    const canonicalUserId = await resolveUserId(params.userId);
    if (!canonicalUserId) {
      return { success: false, error: "User not found in database." };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, canonicalUserId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User record not found." };
    }

    const roleToAssign: MembershipRole = (params.membershipRole as any) || 
      (user.organizationRole === "client" ? "client" : user.organizationRole === "consultant" ? "consultant" : "designer");

    const [membership] = await db
      .insert(projectMemberships)
      .values({
        projectId: canonicalProjectId,
        userId: canonicalUserId,
        orgId: user.orgId,
        membershipRole: roleToAssign,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [projectMemberships.projectId, projectMemberships.userId],
        set: {
          status: "active",
          membershipRole: roleToAssign,
          revokedAt: null,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();

    await invalidateWorkspaceEntities({
      orgId: user.orgId,
      projectId: canonicalProjectId,
      userId: canonicalUserId,
    });

    return { success: true, membershipId: membership.id };
  } catch (err: any) {
    console.error("Failed to add project member in database:", err);
    return { success: false, error: err.message || "Failed to add project member." };
  }
}

export async function removeProjectMemberAction(params: {
  projectId: string;
  userId: string;
  actorUserId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const canonicalProjectId = await resolveProjectId(params.projectId);
    if (!canonicalProjectId) return { success: false, error: "Project not found." };

    const canonicalUserId = await resolveUserId(params.userId);
    if (!canonicalUserId) return { success: false, error: "User not found." };

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
    console.error("Failed to remove project member in database:", err);
    return { success: false, error: err.message || "Failed to remove project member." };
  }
}

export async function archiveProjectAction(params: {
  projectId: string;
  actorUserId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const canonicalProjectId = await resolveProjectId(params.projectId);
    if (!canonicalProjectId) return { success: false, error: "Project not found." };

    await db
      .update(projects)
      .set({
        status: "archived",
        archivedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(projects.id, canonicalProjectId));

    await invalidateWorkspaceEntities({
      projectId: canonicalProjectId,
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to archive project in database:", err);
    return { success: false, error: err.message || "Failed to archive project." };
  }
}

export async function restoreProjectAction(params: {
  projectId: string;
  actorUserId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const canonicalProjectId = await resolveProjectId(params.projectId);
    if (!canonicalProjectId) return { success: false, error: "Project not found." };

    await db
      .update(projects)
      .set({
        status: "active",
        archivedAt: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(projects.id, canonicalProjectId));

    await invalidateWorkspaceEntities({
      projectId: canonicalProjectId,
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to restore project in database:", err);
    return { success: false, error: err.message || "Failed to restore project." };
  }
}

