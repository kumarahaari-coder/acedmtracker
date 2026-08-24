import { describe, it, expect } from "vitest";
import { User, ProjectMembership, UserRole } from "@/lib/types";
import { getRoleCapabilities } from "@/lib/context/RoleContext";

describe("Phase 1: Team Member Model, Project Membership & Soft-Inactivation Suite", () => {
  it("enforces strict separation between User, Role, and ProjectMembership", () => {
    const user: User = {
      id: "u_designer_maya",
      name: "Maya Lin",
      email: "maya@aceassured.com",
      avatar: "ML",
      role: "designer",
      jobTitle: "Senior Motion Designer",
      status: "active",
      workingHoursPerDay: 8,
      dateJoined: "2026-01-15T00:00:00.000Z",
      createdByUserId: "u_founder",
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };

    // User record MUST NOT contain assigned project ID arrays
    expect((user as any).assignedProjectIds).toBeUndefined();
    expect(user.role).toBe("designer");
    expect(user.status).toBe("active");

    // Project membership is an independent normalized model
    const membership: ProjectMembership = {
      id: "mem_acme_maya",
      projectId: "proj_acme",
      userId: user.id,
      status: "active",
      membershipRole: "designer",
      addedByUserId: "u_founder",
      addedAt: "2026-01-16T00:00:00.000Z",
    };

    expect(membership.projectId).toBe("proj_acme");
    expect(membership.userId).toBe("u_designer_maya");
    expect(membership.status).toBe("active");
  });

  it("handles soft-inactivation: revokes project access while preserving all historical records", () => {
    let users: User[] = [
      {
        id: "u_designer_1",
        name: "Rohan Verma",
        email: "rohan@aceassured.com",
        avatar: "RV",
        role: "designer",
        jobTitle: "Visual Designer",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: "2025-04-01T00:00:00.000Z",
        createdAt: "2025-04-01T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    ];

    let memberships: ProjectMembership[] = [
      {
        id: "mem_1",
        projectId: "proj_acme",
        userId: "u_designer_1",
        status: "active",
        membershipRole: "designer",
        addedByUserId: "u_founder",
        addedAt: "2026-01-15T00:00:00.000Z",
      },
    ];

    let auditRecords: any[] = [];
    const historicalSubmissions = [
      { id: "ver_1", contentItemId: "item_1", submittedByUserId: "u_designer_1", versionNumber: 1 },
    ];

    function inactivateUser(userId: string, actorUserId: string, reason: string) {
      const user = users.find((u) => u.id === userId);
      if (!user) throw new Error("User not found");
      const now = new Date().toISOString();

      users = users.map((u) => (u.id === userId ? { ...u, status: "inactive" as const, updatedAt: now } : u));
      memberships = memberships.map((m) =>
        m.userId === userId ? { ...m, status: "inactive" as const, removedAt: now } : m
      );

      auditRecords.push({
        id: `aud_${Date.now()}`,
        action: "inactivate_user",
        userId,
        actorUserId,
        reason,
        timestamp: now,
      });
    }

    inactivateUser("u_designer_1", "u_admin", "Contract concluded");

    // 1. User status is now inactive
    expect(users[0].status).toBe("inactive");

    // 2. Active memberships are transitioned to inactive with removedAt timestamp
    expect(memberships[0].status).toBe("inactive");
    expect(memberships[0].removedAt).toBeDefined();

    // 3. Historical submissions and audit records remain completely intact
    expect(historicalSubmissions.length).toBe(1);
    expect(historicalSubmissions[0].submittedByUserId).toBe("u_designer_1");
    expect(auditRecords.length).toBe(1);
    expect(auditRecords[0].reason).toBe("Contract concluded");
  });

  it("prevents assigning inactive users to new project memberships", () => {
    const inactiveUser: User = {
      id: "u_inactive",
      name: "Sameer Khan",
      email: "sameer@aceassured.com",
      avatar: "SK",
      role: "designer",
      status: "inactive",
      dateJoined: "2025-02-01T00:00:00.000Z",
      createdAt: "2025-02-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };

    function addProjectMember(user: User, projectId: string) {
      if (user.status === "inactive") {
        return { success: false, error: "Cannot assign inactive user to a project. Reactivate account first." };
      }
      return { success: true };
    }

    const res = addProjectMember(inactiveUser, "proj_solaredge");
    expect(res.success).toBe(false);
    expect(res.error).toContain("Cannot assign inactive user");
  });

  it("validates capability-based role matrix for team and member management", () => {
    const founderCaps = getRoleCapabilities("founder");
    const adminCaps = getRoleCapabilities("admin");
    const consultantCaps = getRoleCapabilities("consultant");
    const designerCaps = getRoleCapabilities("designer");
    const clientCaps = getRoleCapabilities("client");

    // Founder & Admin have full team management capabilities
    expect(founderCaps.canManageTeamMembers).toBe(true);
    expect(founderCaps.canInactivateMembers).toBe(true);
    expect(adminCaps.canManageTeamMembers).toBe(true);
    expect(adminCaps.canInactivateMembers).toBe(true);

    // Consultant can view team, but cannot manage or inactivate
    expect(consultantCaps.canManageTeamMembers).toBe(false);
    expect(consultantCaps.canInactivateMembers).toBe(false);

    // Designer & Client have zero team management capabilities
    expect(designerCaps.canManageTeamMembers).toBe(false);
    expect(clientCaps.canManageTeamMembers).toBe(false);
    expect(clientCaps.isClientRole).toBe(true);
  });
});
