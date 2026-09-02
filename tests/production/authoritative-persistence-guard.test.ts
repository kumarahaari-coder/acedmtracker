import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

vi.mock("@/lib/actions/projects", () => ({
  createProjectAction: vi.fn(async (params: any) => {
    if (params.name === "Fail Project") {
      return { success: false, error: "Database transaction failed" };
    }
    return {
      success: true,
      project: {
        id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        name: params.name,
        clientBrand: params.clientBrand,
        scope: params.scope,
        status: "active",
        createdAt: "2026-09-02T10:00:00.000Z",
      },
    };
  }),
  archiveProjectAction: vi.fn(async ({ projectId }: any) => ({
    success: true,
    projectId,
  })),
  restoreProjectAction: vi.fn(async ({ projectId }: any) => ({
    success: true,
    projectId,
  })),
  addProjectMemberAction: vi.fn(async (params: any) => ({
    success: true,
    membershipId: "pm-canonical-uuid-12345",
  })),
  removeProjectMemberAction: vi.fn(async (params: any) => ({
    success: true,
  })),
}));

vi.mock("@/lib/actions/collaboration", () => ({
  createCampaignAction: vi.fn(async (params: any) => ({
    success: true,
    campaign: {
      id: "camp-canonical-uuid-9999",
      projectId: params.projectId,
      name: params.name,
      objective: params.objective,
      description: params.description,
      status: params.status || "planning",
      startDate: params.startDate,
      endDate: params.endDate,
      ownerId: params.ownerId,
    },
  })),
}));

describe("Authoritative Persistence & Database-First Invariant Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. createProject enforces PostgreSQL transaction, returns canonical UUID, and never generates synthetic proj_* IDs", async () => {
    const { result } = renderHook(
      () => {
        const appState = useAppState();
        const role = useRole();
        return { appState, role };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(AppStateProvider, null, React.createElement(RoleProvider, null, children)),
      }
    );

    let res: any;
    await act(async () => {
      res = await result.current.appState.createProject(
        {
          name: "Alpha Production Launch",
          clientBrand: "Alpha Corp",
          avatar: "AC",
          scope: "Global launch campaign",
          timezone: "Asia/Kolkata",
          status: "active",
          engagementModel: "deliverable_based",
          targetRequirements: { posts: 10, carousels: 4, reels: 6, trialReels: 0 },
          workflowStages: ["Draft", "In Review", "Approved", "Published"],
        },
        "u_founder"
      );
    });

    expect(res.success).toBe(true);
    expect(res.project.id).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(res.project.id.startsWith("proj_")).toBe(false);

    const stored = result.current.appState.state.projects.find(
      (p) => p.id === "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    );
    expect(stored).toBeDefined();
    expect(stored?.name).toBe("Alpha Production Launch");
  });

  it("2. If database creation fails, state is untouched, no phantom record is created, and user-safe error is returned", async () => {
    const { result } = renderHook(
      () => {
        const appState = useAppState();
        const role = useRole();
        return { appState, role };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(AppStateProvider, null, React.createElement(RoleProvider, null, children)),
      }
    );

    const initialProjectCount = result.current.appState.state.projects.length;

    let res: any;
    await act(async () => {
      res = await result.current.appState.createProject(
        {
          name: "Fail Project",
          clientBrand: "Fail Brand",
          avatar: "FB",
          scope: "Should not persist",
          timezone: "Asia/Kolkata",
          status: "active",
          engagementModel: "deliverable_based",
          targetRequirements: { posts: 0, carousels: 0, reels: 0, trialReels: 0 },
          workflowStages: ["Draft"],
        },
        "u_founder"
      );
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Database transaction failed");
    expect(result.current.appState.state.projects.length).toBe(initialProjectCount);
    expect(result.current.appState.state.projects.some((p) => p.name === "Fail Project")).toBe(false);
  });

  it("3. Membership operations execute against canonical PostgreSQL UUID", async () => {
    const { result } = renderHook(
      () => {
        const appState = useAppState();
        const role = useRole();
        return { appState, role };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(AppStateProvider, null, React.createElement(RoleProvider, null, children)),
      }
    );

    let projectRes: any;
    await act(async () => {
      projectRes = await result.current.appState.createProject(
        {
          name: "Member Test Project",
          clientBrand: "Member Corp",
          avatar: "MC",
          scope: "Membership testing",
          timezone: "Asia/Kolkata",
          status: "active",
          targetRequirements: { posts: 5, carousels: 2, reels: 2, trialReels: 0 },
          workflowStages: ["Draft"],
        },
        "u_founder"
      );
    });

    const canonicalProjectId = projectRes.project.id;

    let memRes: any;
    await act(async () => {
      memRes = await result.current.appState.addProjectMember({
        projectId: canonicalProjectId,
        userId: "u_designer1",
        membershipRole: "designer",
        actorUserId: "u_founder",
      });
    });

    expect(memRes.success).toBe(true);
    expect(memRes.membership.projectId).toBe(canonicalProjectId);

    const savedMembership = result.current.appState.state.projectMemberships.find(
      (m) => m.projectId === canonicalProjectId && m.userId === "u_designer1"
    );
    expect(savedMembership).toBeDefined();
    expect(savedMembership?.status).toBe("active");
  });

  it("4. PostgreSQL-backed Campaigns create and return canonical record", async () => {
    const { result } = renderHook(
      () => {
        const appState = useAppState();
        const role = useRole();
        return { appState, role };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(AppStateProvider, null, React.createElement(RoleProvider, null, children)),
      }
    );

    let campRes: any;
    await act(async () => {
      campRes = await result.current.appState.createCampaign(
        {
          projectId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          name: "Diwali 2026 Mega Campaign",
          objective: "Festival Sales Boost",
          description: "Special seasonal rollout",
          status: "active",
          ownerId: "u_founder",
        },
        "u_founder"
      );
    });

    expect(campRes.success).toBe(true);
    expect(campRes.campaign.id).toBe("camp-canonical-uuid-9999");
    expect(result.current.appState.state.campaigns.some((c) => c.id === "camp-canonical-uuid-9999")).toBe(true);
  });
});
