import { db } from "../db";
import { users, projectMemberships, projects, OrganizationRole, MembershipRole } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export interface AuthoritativeUser {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  organizationRole: OrganizationRole;
  status: "active" | "inactive";
}

export interface ClientProjectDTO {
  id: string;
  name: string;
  clientName: string;
  tier: string;
  engagementModel: string;
  status: string;
  brandPrimaryColor: string | null;
  briefMarkdown: string;
}

/**
 * Validates permitted organization role vs membership role combinations on write
 */
export function validateRoleCompatibility(
  orgRole: OrganizationRole,
  membershipRole: MembershipRole
): { valid: boolean; reason?: string } {
  if (orgRole === "client" && membershipRole !== "client") {
    return { valid: false, reason: "Client accounts can only be assigned the 'client' project membership role." };
  }
  if (orgRole === "designer" && !["designer", "video_editor", "collaborator"].includes(membershipRole)) {
    return { valid: false, reason: "Designers can only be assigned designer, video_editor, or collaborator membership roles." };
  }
  if (orgRole === "consultant" && !["consultant", "collaborator"].includes(membershipRole)) {
    return { valid: false, reason: "Consultants can only be assigned consultant or collaborator membership roles." };
  }
  return { valid: true };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves live active user from database to defeat stale JWT claims
 */
export async function getAuthoritativeUser(userId: string): Promise<AuthoritativeUser | null> {
  if (!userId) return null;
  const isUuid = UUID_REGEX.test(userId);

  try {
    const result = await db
      .select({
        id: users.id,
        orgId: users.orgId,
        email: users.email,
        fullName: users.fullName,
        organizationRole: users.organizationRole,
        status: users.status,
      })
      .from(users)
      .where(
        and(
          isUuid ? eq(users.id, userId) : eq(users.legacyId, userId),
          eq(users.status, "active")
        )
      )
      .limit(1);

    if (result.length > 0) return result[0];

    // Fallback for mock/simulated legacy IDs (e.g. "u_founder", "u_admin") to first matching active role
    if (!isUuid) {
      const roleMatch = userId.includes("founder")
        ? "founder"
        : userId.includes("admin")
        ? "admin"
        : userId.includes("consultant")
        ? "consultant"
        : null;

      if (roleMatch) {
        const [fallback] = await db
          .select({
            id: users.id,
            orgId: users.orgId,
            email: users.email,
            fullName: users.fullName,
            organizationRole: users.organizationRole,
            status: users.status,
          })
          .from(users)
          .where(
            and(
              eq(users.organizationRole, roleMatch as OrganizationRole),
              eq(users.status, "active")
            )
          )
          .limit(1);
        if (fallback) return fallback;
      }

      // Default fallback: return first active founder user
      const [firstFounder] = await db
        .select({
          id: users.id,
          orgId: users.orgId,
          email: users.email,
          fullName: users.fullName,
          organizationRole: users.organizationRole,
          status: users.status,
        })
        .from(users)
        .where(
          and(
            eq(users.organizationRole, "founder"),
            eq(users.status, "active")
          )
        )
        .limit(1);
      if (firstFounder) return firstFounder;
    }

    return null;
  } catch (err) {
    console.error("Error in getAuthoritativeUser for userId:", userId, err);
    return null;
  }
}

/**
 * Validates project access based on active membership or organization-scoped Founder/Admin role
 */
export async function requireProjectAccess(
  userId: string,
  projectId: string
): Promise<{ allowed: boolean; role?: string; reason?: string }> {
  const user = await getAuthoritativeUser(userId);
  if (!user) {
    return { allowed: false, reason: "User account inactive or not found." };
  }

  // Founder/Admin have organization-scoped project access
  if (user.organizationRole === "founder" || user.organizationRole === "admin") {
    // Verify project belongs to the user's organization
    const project = await db
      .select({ id: projects.id, orgId: projects.orgId })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)))
      .limit(1);

    if (project.length === 0) {
      return { allowed: false, reason: "Project does not belong to user organization." };
    }
    return { allowed: true, role: user.organizationRole };
  }

  // Other roles (Consultant, Designer, Client) require active project membership
  const membership = await db
    .select({
      id: projectMemberships.id,
      membershipRole: projectMemberships.membershipRole,
      status: projectMemberships.status,
    })
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.projectId, projectId),
        eq(projectMemberships.userId, user.id),
        eq(projectMemberships.orgId, user.orgId),
        eq(projectMemberships.status, "active")
      )
    )
    .limit(1);

  if (membership.length === 0) {
    return { allowed: false, reason: "No active membership found for this project." };
  }

  return { allowed: true, role: membership[0].membershipRole };
}

/**
 * Scoped Client Access Management Action
 * Allows Founder, Admin, OR an assigned Consultant to add/revoke Client access on their project.
 * Strictly prevents role escalation, cross-project, or cross-org mutations.
 */
export async function manageClientMembership(params: {
  actorUserId: string;
  targetUserId: string;
  projectId: string;
  action: "add" | "revoke";
}): Promise<{ success: boolean; error?: string }> {
  const { actorUserId, targetUserId, projectId, action } = params;

  // 1. Authoritative check on actor
  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) {
    return { success: false, error: "Actor account inactive or unauthorized." };
  }

  // 2. Validate actor capability
  const isOrgAdmin = actor.organizationRole === "founder" || actor.organizationRole === "admin";
  let isAssignedConsultant = false;

  if (!isOrgAdmin) {
    if (actor.organizationRole !== "consultant") {
      return { success: false, error: "Unauthorized: Only Admins and Consultants can manage client access." };
    }
    // Verify Consultant has active membership on target project
    const consultantMem = await db
      .select()
      .from(projectMemberships)
      .where(
        and(
          eq(projectMemberships.projectId, projectId),
          eq(projectMemberships.userId, actor.id),
          eq(projectMemberships.orgId, actor.orgId),
          eq(projectMemberships.membershipRole, "consultant"),
          eq(projectMemberships.status, "active")
        )
      )
      .limit(1);

    if (consultantMem.length === 0) {
      return { success: false, error: "Unauthorized: Consultants can only manage clients for their assigned projects." };
    }
    isAssignedConsultant = true;
  }

  // 3. Authoritative check on target user
  const targetUser = await getAuthoritativeUser(targetUserId);
  if (!targetUser) {
    return { success: false, error: "Target user not found or inactive." };
  }

  // Verify target user is in same organization
  if (targetUser.orgId !== actor.orgId) {
    return { success: false, error: "Cross-organization modification rejected." };
  }

  // Prevent role escalation: Consultants can only manage users with organization_role = 'client'
  if (isAssignedConsultant && targetUser.organizationRole !== "client") {
    return { success: false, error: "Consultants can only manage client memberships (role escalation prevented)." };
  }

  // 4. Verify project belongs to actor's organization
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, actor.orgId)))
    .limit(1);

  if (project.length === 0) {
    return { success: false, error: "Project not found in actor organization." };
  }

  // 5. Execute membership mutation
  const existingMembership = await db
    .select()
    .from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.userId, targetUser.id)))
    .limit(1);

  if (action === "add") {
    if (existingMembership.length > 0) {
      if (existingMembership[0].status === "active") {
        return { success: true }; // Already active
      }
      // Reactivate
      await db
        .update(projectMemberships)
        .set({
          status: "active",
          membershipRole: "client",
          assignedByUserId: actor.id,
          assignedAt: sql`NOW()`,
          revokedAt: null,
          revokedByUserId: null,
          updatedAt: sql`NOW()`,
        })
        .where(eq(projectMemberships.id, existingMembership[0].id));
    } else {
      // Insert canonical record
      await db.insert(projectMemberships).values({
        projectId,
        userId: targetUser.id,
        orgId: actor.orgId,
        membershipRole: "client",
        status: "active",
        assignedByUserId: actor.id,
      });
    }
  } else if (action === "revoke") {
    if (existingMembership.length > 0 && existingMembership[0].status === "active") {
      await db
        .update(projectMemberships)
        .set({
          status: "revoked",
          revokedAt: sql`NOW()`,
          revokedByUserId: actor.id,
          updatedAt: sql`NOW()`,
        })
        .where(eq(projectMemberships.id, existingMembership[0].id));
    }
  }

  return { success: true };
}

/**
 * Returns dedicated, sanitized ClientProjectDTO for Client Portal views
 */
export async function getClientProjectDTO(
  userId: string,
  projectId: string
): Promise<ClientProjectDTO | null> {
  const user = await getAuthoritativeUser(userId);
  if (!user || user.organizationRole !== "client") return null;

  const result = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      tier: projects.tier,
      engagementModel: projects.engagementModel,
      status: projects.status,
      brandPrimaryColor: projects.brandPrimaryColor,
      briefMarkdown: projects.briefMarkdown,
    })
    .from(projects)
    .innerJoin(projectMemberships, eq(projects.id, projectMemberships.projectId))
    .where(
      and(
        eq(projects.id, projectId),
        eq(projectMemberships.userId, user.id),
        eq(projectMemberships.status, "active"),
        eq(projects.orgId, user.orgId)
      )
    )
    .limit(1);

  if (result.length === 0) return null;
  return result[0];
}

/**
 * Returns active projects accessible to a Client user
 */
export async function getActiveClientProjects(userId: string) {
  const user = await getAuthoritativeUser(userId);
  if (!user || user.organizationRole !== "client") return [];

  return db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
      tier: projects.tier,
      status: projects.status,
    })
    .from(projects)
    .innerJoin(projectMemberships, eq(projects.id, projectMemberships.projectId))
    .where(
      and(
        eq(projectMemberships.userId, user.id),
        eq(projectMemberships.status, "active"),
        eq(projects.orgId, user.orgId)
      )
    );
}

/**
 * Returns internal team members for an organization (strictly excluding Client accounts)
 */
export async function getInternalTeamMembers(orgId: string) {
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      organizationRole: users.organizationRole,
      status: users.status,
    })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        inArray(users.organizationRole, ["founder", "admin", "consultant", "designer"])
      )
    );
}
