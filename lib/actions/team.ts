"use server";

import { db } from "../db";
import { users } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { OrganizationRole, UserStatus } from "../db/schema/users";
import { invalidateWorkspaceEntities } from "./revalidation";

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
    await db
      .update(users)
      .set({
        status: params.status,
        updatedAt: sql`NOW()`,
      })
      .where(eq(users.id, params.userId));

    return { success: true };
  } catch (err: any) {
    console.error("Failed to update team member status:", err);
    return { success: false, error: err.message || "Failed to update team member status." };
  }
}
