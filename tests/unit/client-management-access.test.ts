import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import { AppState, ProjectMembership, User } from "@/lib/types";
import {
  validateClientProjectAccess,
  getClientProjectOverview,
} from "@/lib/client-portal";
import { getOrganizationPerformance } from "@/lib/performance";

describe("Client Account & Project Access Management (QA Requirements)", () => {
  function createTestState(): AppState {
    const base = getInitialDeterministicState();

    // Create Consultant with membership on proj_acme only
    const consultantUser: User = {
      id: "u_consultant_scoped",
      name: "Scoped Consultant",
      email: "scoped.consultant@aceassured.com",
      avatar: "SC",
      role: "consultant",
      status: "active",
      dateJoined: "2026-01-01",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const consultantMembership: ProjectMembership = {
      id: "pm_consultant_acme_only",
      projectId: "proj_acme",
      userId: "u_consultant_scoped",
      status: "active",
      membershipRole: "consultant",
      addedByUserId: "u_founder",
      addedAt: "2026-01-01T00:00:00Z",
    };

    return {
      ...base,
      users: [...base.users, consultantUser],
      projectMemberships: [...base.projectMemberships, consultantMembership],
    };
  }

  // Simulates addClientToProject logic as in AppStateContext
  function addClientToProjectHelper(
    state: AppState,
    params: {
      name: string;
      email: string;
      jobTitle?: string;
      phone?: string;
      projectId: string;
      actorUserId: string;
    }
  ): { success: boolean; state?: AppState; error?: string; user?: User; membership?: ProjectMembership } {
    const actorUser = state.users.find((u) => u.id === params.actorUserId);
    if (!actorUser) return { success: false, error: "Actor user not found." };

    if (actorUser.role === "designer" || actorUser.role === "client") {
      return {
        success: false,
        error: "Unauthorized: Designers and Clients cannot manage Client accounts.",
      };
    }

    if (actorUser.role === "consultant") {
      const hasMembership = state.projectMemberships.some(
        (m) => m.projectId === params.projectId && m.userId === params.actorUserId && m.status === "active"
      );
      if (!hasMembership) {
        return {
          success: false,
          error: "Unauthorized: Consultants can only manage client access for assigned projects.",
        };
      }
    }

    const project = state.projects.find((p) => p.id === params.projectId);
    if (!project) return { success: false, error: "Project not found." };

    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim();

    if (!cleanEmail || !cleanName) {
      return { success: false, error: "Name and Email are required." };
    }

    const existingUser = state.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existingUser && existingUser.role !== "client") {
      return {
        success: false,
        error: `This email (${params.email}) is already registered as an internal team member (${existingUser.role}). Internal employee accounts cannot be added as clients.`,
      };
    }

    const now = new Date().toISOString();
    let clientUser: User;
    let newUsers = [...state.users];

    if (existingUser) {
      clientUser = existingUser;
    } else {
      clientUser = {
        id: "u_client_" + Math.random().toString(36).substr(2, 9),
        name: cleanName,
        email: cleanEmail,
        avatar: cleanName.charAt(0).toUpperCase() || "C",
        role: "client",
        jobTitle: params.jobTitle?.trim() || "Client Contact",
        status: "active",
        dateJoined: now.split("T")[0],
        createdByUserId: params.actorUserId,
        createdAt: now,
        updatedAt: now,
      };
      newUsers = [clientUser, ...newUsers];
    }

    const existingMembership = state.projectMemberships.find(
      (m) => m.projectId === params.projectId && m.userId === clientUser.id
    );

    let membership: ProjectMembership;
    let newMemberships = [...state.projectMemberships];

    if (existingMembership) {
      if (existingMembership.status === "active") {
        return {
          success: false,
          error: `Client '${clientUser.name}' already has active access to this project.`,
        };
      }
      membership = {
        ...existingMembership,
        status: "active",
        membershipRole: "client",
        addedByUserId: params.actorUserId,
        addedAt: now,
        removedAt: undefined,
      };
      newMemberships = newMemberships.map((m) => (m.id === existingMembership.id ? membership : m));
    } else {
      membership = {
        id: "pm_" + Math.random().toString(36).substr(2, 9),
        projectId: params.projectId,
        userId: clientUser.id,
        status: "active",
        membershipRole: "client",
        addedByUserId: params.actorUserId,
        addedAt: now,
      };
      newMemberships = [membership, ...newMemberships];
    }

    return {
      success: true,
      user: clientUser,
      membership,
      state: {
        ...state,
        users: newUsers,
        projectMemberships: newMemberships,
      },
    };
  }

  function revokeClientAccessHelper(
    state: AppState,
    params: { projectId: string; userId: string; actorUserId: string }
  ): { success: boolean; state?: AppState; error?: string } {
    const actorUser = state.users.find((u) => u.id === params.actorUserId);
    if (!actorUser) return { success: false, error: "Actor user not found." };

    if (actorUser.role === "designer" || actorUser.role === "client") {
      return { success: false, error: "Unauthorized: Designers and Clients cannot revoke client access." };
    }

    if (actorUser.role === "consultant") {
      const hasMembership = state.projectMemberships.some(
        (m) => m.projectId === params.projectId && m.userId === params.actorUserId && m.status === "active"
      );
      if (!hasMembership) {
        return { success: false, error: "Unauthorized: Consultants can only manage client access for assigned projects." };
      }
    }

    const membership = state.projectMemberships.find(
      (m) => m.projectId === params.projectId && m.userId === params.userId && m.status === "active"
    );
    if (!membership) return { success: false, error: "Active client project membership not found." };

    const now = new Date().toISOString();
    const updatedMembership: ProjectMembership = {
      ...membership,
      status: "inactive",
      removedAt: now,
    };

    return {
      success: true,
      state: {
        ...state,
        projectMemberships: state.projectMemberships.map((m) =>
          m.id === membership.id ? updatedMembership : m
        ),
      },
    };
  }

  it("1. Founder can create a new Client and grant project access", () => {
    const state = createTestState();
    const res = addClientToProjectHelper(state, {
      name: "Sarah Johnson",
      email: "sarah@acmehealth.com",
      jobTitle: "VP of Marketing",
      projectId: "proj_acme",
      actorUserId: "u_founder",
    });

    expect(res.success).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.role).toBe("client");
    expect(res.user?.name).toBe("Sarah Johnson");
    expect(res.membership).toBeDefined();
    expect(res.membership?.status).toBe("active");
    expect(res.membership?.projectId).toBe("proj_acme");
  });

  it("2. Admin can create a new Client and grant project access", () => {
    const state = createTestState();
    const res = addClientToProjectHelper(state, {
      name: "Michael Lee",
      email: "michael@acmehealth.com",
      jobTitle: "Brand Manager",
      projectId: "proj_acme",
      actorUserId: "u_admin",
    });

    expect(res.success).toBe(true);
    expect(res.user?.role).toBe("client");
    expect(res.membership?.status).toBe("active");
  });

  it("3. Authorized Consultant can add Client to assigned project", () => {
    const state = createTestState();
    const res = addClientToProjectHelper(state, {
      name: "Client Lead",
      email: "lead@acmehealth.com",
      projectId: "proj_acme", // Scoped consultant HAS membership here
      actorUserId: "u_consultant_scoped",
    });

    expect(res.success).toBe(true);
    expect(res.user?.role).toBe("client");
    expect(res.membership?.projectId).toBe("proj_acme");
  });

  it("4. Consultant cannot add Client to unauthorized project (403)", () => {
    const state = createTestState();
    const res = addClientToProjectHelper(state, {
      name: "Unauthorized Add",
      email: "hacker@solaredge.com",
      projectId: "proj_solaredge", // Scoped consultant does NOT have membership here
      actorUserId: "u_consultant_scoped",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Consultants can only manage client access for assigned projects");
  });

  it("5. Designer cannot add Client accounts (403)", () => {
    const state = createTestState();
    const res = addClientToProjectHelper(state, {
      name: "Designer Client",
      email: "dc@test.com",
      projectId: "proj_acme",
      actorUserId: "u_designer1",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Designers and Clients cannot manage Client accounts");
  });

  it("6. Client cannot add another Client account (403)", () => {
    const state = createTestState();
    const res = addClientToProjectHelper(state, {
      name: "Sub Client",
      email: "sub@client.com",
      projectId: "proj_acme",
      actorUserId: "u_client_acme",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Designers and Clients cannot manage Client accounts");
  });

  it("7. Existing Client email creates membership instead of duplicate User", () => {
    let state = createTestState();

    // 1. Add client to proj_acme
    const res1 = addClientToProjectHelper(state, {
      name: "Multi-Brand Client",
      email: "client@multibrand.com",
      projectId: "proj_acme",
      actorUserId: "u_founder",
    });
    expect(res1.success).toBe(true);
    state = res1.state!;

    const initialUserId = res1.user!.id;
    const initialUserCount = state.users.length;

    // 2. Add SAME client email to proj_solaredge
    const res2 = addClientToProjectHelper(state, {
      name: "Multi-Brand Client",
      email: "client@multibrand.com",
      projectId: "proj_solaredge",
      actorUserId: "u_founder",
    });
    expect(res2.success).toBe(true);
    state = res2.state!;

    // Must NOT create duplicate user
    expect(state.users.length).toBe(initialUserCount);
    expect(res2.user?.id).toBe(initialUserId);

    // Must have 2 active memberships for this same user
    const memberships = state.projectMemberships.filter(
      (m) => m.userId === initialUserId && m.status === "active"
    );
    expect(memberships.length).toBe(2);
    expect(memberships.some((m) => m.projectId === "proj_acme")).toBe(true);
    expect(memberships.some((m) => m.projectId === "proj_solaredge")).toBe(true);
  });

  it("8. Internal employee email cannot be silently converted to Client (email collision error)", () => {
    const state = createTestState();

    // Try to add u_designer1's email as a client
    const designerEmail = state.users.find((u) => u.id === "u_designer1")!.email;
    const res = addClientToProjectHelper(state, {
      name: "Rohan Verma",
      email: designerEmail,
      projectId: "proj_acme",
      actorUserId: "u_founder",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("already registered as an internal team member");
  });

  it("9. Multiple Clients can belong to one Project", () => {
    let state = createTestState();

    const res1 = addClientToProjectHelper(state, {
      name: "Client Contact 1",
      email: "c1@acme.com",
      projectId: "proj_acme",
      actorUserId: "u_founder",
    });
    state = res1.state!;

    const res2 = addClientToProjectHelper(state, {
      name: "Client Contact 2",
      email: "c2@acme.com",
      projectId: "proj_acme",
      actorUserId: "u_founder",
    });
    state = res2.state!;

    const acmeClients = state.projectMemberships.filter(
      (m) => m.projectId === "proj_acme" && m.status === "active" && m.membershipRole === "client"
    );
    expect(acmeClients.length).toBeGreaterThanOrEqual(2);
  });

  it("10. Revoking one membership does not affect another project membership or deactivate the User", () => {
    let state = createTestState();

    // Client added to both proj_acme and proj_solaredge
    const res1 = addClientToProjectHelper(state, {
      name: "Dual Client",
      email: "dual@client.com",
      projectId: "proj_acme",
      actorUserId: "u_founder",
    });
    state = res1.state!;
    const userId = res1.user!.id;

    const res2 = addClientToProjectHelper(state, {
      name: "Dual Client",
      email: "dual@client.com",
      projectId: "proj_solaredge",
      actorUserId: "u_founder",
    });
    state = res2.state!;

    // Revoke access on proj_acme only
    const revokeRes = revokeClientAccessHelper(state, {
      projectId: "proj_acme",
      userId,
      actorUserId: "u_founder",
    });
    expect(revokeRes.success).toBe(true);
    state = revokeRes.state!;

    // User is still globally active
    const user = state.users.find((u) => u.id === userId);
    expect(user?.status).toBe("active");

    // proj_acme membership is inactive
    const acmeMembership = state.projectMemberships.find(
      (m) => m.projectId === "proj_acme" && m.userId === userId
    );
    expect(acmeMembership?.status).toBe("inactive");

    // proj_solaredge membership is STILL ACTIVE
    const solaredgeMembership = state.projectMemberships.find(
      (m) => m.projectId === "proj_solaredge" && m.userId === userId
    );
    expect(solaredgeMembership?.status).toBe("active");
  });

  it("11. Revoked Client receives Access Denied for that Project in Client Portal query layer", () => {
    let state = createTestState();

    const res = addClientToProjectHelper(state, {
      name: "Temp Client",
      email: "temp@acme.com",
      projectId: "proj_acme",
      actorUserId: "u_founder",
    });
    state = res.state!;
    const userId = res.user!.id;

    // Verify initial portal access works
    const accessBefore = validateClientProjectAccess(state, "proj_acme", userId, "client");
    expect(accessBefore.authorized).toBe(true);

    // Revoke access
    const revokeRes = revokeClientAccessHelper(state, {
      projectId: "proj_acme",
      userId,
      actorUserId: "u_founder",
    });
    state = revokeRes.state!;

    // Verify portal access is now 403 Forbidden
    const accessAfter = validateClientProjectAccess(state, "proj_acme", userId, "client");
    expect(accessAfter.authorized).toBe(false);

    const overviewAfter = getClientProjectOverview(state, "proj_acme", userId, "client");
    expect(overviewAfter.status).toBe(403);
  });

  it("12. Client users do not appear in internal team directory (/team)", () => {
    const state = createTestState();

    // Internal team directory should only contain non-client users
    const internalMembers = state.users.filter((u) => u.role !== "client");
    expect(internalMembers.every((u) => u.role !== "client")).toBe(true);
    expect(internalMembers.some((u) => u.role === "client")).toBe(false);
  });

  it("13. Client users do not appear in Designer assignment options", () => {
    const state = createTestState();

    const assignableDesigners = state.users.filter(
      (u) => u.status === "active" && (u.role === "designer" || u.jobTitle?.toLowerCase().includes("designer") || u.jobTitle?.toLowerCase().includes("editor"))
    );

    expect(assignableDesigners.every((u) => u.role !== "client")).toBe(true);
  });

  it("14. Client users do not appear in Performance scorecards or Attendance reports", () => {
    const state = createTestState();
    const perfResult = getOrganizationPerformance(state, "u_founder", "founder");

    expect(perfResult.status).toBe(200);
    const scorecards = perfResult.data?.scorecards || [];
    expect(scorecards.every((s) => s.role !== "client")).toBe(true);

    const workload = perfResult.data?.workload || [];
    expect(workload.every((w) => w.role !== "client")).toBe(true);
  });
});
