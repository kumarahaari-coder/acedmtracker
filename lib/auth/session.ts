import { db } from "../db";
import { users, projectMemberships, projects, OrganizationRole, MembershipRole } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";

export interface AuthoritativeUser {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  organizationRole: OrganizationRole;
  status: "active" | "inactive";
}

/**
 * Validates permitted organization role vs membership role combinations
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

/**
 * Resolves live active user from database to defeat stale JWT claims
 */
export async function getAuthoritativeUser(userId: string): Promise<AuthoritativeUser | null> {
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
    .where(and(eq(users.id, userId), eq(users.status, "active")))
    .limit(1);

  if (result.length === 0) return null;
  return result[0];
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
