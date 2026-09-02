import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

vi.mock("@/lib/actions/projects", () => ({
  createProjectAction: vi.fn(async (params: any) => ({
    success: true,
    project: {
      id: "proj_canonical_pem_1",
      name: params.name,
      clientBrand: params.clientBrand,
      scope: params.scope,
      status: "active",
      createdAt: "2026-09-02T10:00:00.000Z",
    },
  })),
}));

vi.mock("@/lib/actions/content", () => ({
  createContentItemAction: vi.fn(async (params: any) => ({
    success: true,
    item: {
      id: "item_canonical_pem_1",
      projectId: params.projectId,
      title: params.title,
      platform: params.platform,
      contentType: params.contentType,
      currentVersionNumber: 1,
      scopeClassification: params.scopeClassification || "contracted",
    },
    version: {
      id: "ver_canonical_pem_1",
      contentItemId: "item_canonical_pem_1",
      versionNumber: 1,
      isDraft: true,
      createdAt: new Date(),
      copy: { caption: "Test", hashtags: [], cta: "" },
      creativeAssets: [],
    },
    assignment: {
      id: "asgn_canonical_pem_1",
      projectId: params.projectId,
      contentItemId: "item_canonical_pem_1",
      assigneeUserId: params.accountableOwnerId || "u_designer1",
      assignmentRole: "designer",
      status: "assigned",
      assignedByUserId: params.actorUserId || "u_founder",
      assignedAt: new Date(),
      initialDueAt: new Date(),
      currentDueAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })),
}));

describe("Project Engagement Models & Goodwill Tracking", () => {
  it("supports creating Deliverable-Based and Objective-Based projects and tracking objective milestones", async () => {
    const { result } = renderHook(
      () => {
        const appState = useAppState();
        const role = useRole();
        return { appState, role };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <AppStateProvider>
            <RoleProvider>{children}</RoleProvider>
          </AppStateProvider>
        ),
      }
    );

    // 1. Create Objective-Based Project
    let createdProject: any;
    await act(async () => {
      const res = await result.current.appState.createProject({
        name: "Lead Generation Initiative",
        clientBrand: "Healthcare Corp",
        avatar: "HC",
        scope: "Digital patient acquisition campaign",
        timezone: "Asia/Kolkata",
        status: "active",
        engagementModel: "objective_based",
        objectiveConfig: {
          objectiveName: "Acquire 500 Qualified Leads",
          metricName: "Qualified Leads",
          targetValue: 500,
          currentValue: 120,
          unit: "leads",
        },
        targetRequirements: {
          posts: 10,
          carousels: 5,
          reels: 5,
          trialReels: 0,
        },
        workflowStages: ["Draft", "In Review", "Approved", "Published"],
      });
      createdProject = res.project;
    });

    expect(createdProject.engagementModel).toBe("objective_based");
    expect(createdProject.objectiveConfig?.currentValue).toBe(120);

    // 2. Update Objective Progress
    act(() => {
      result.current.appState.updateProjectObjective({
        projectId: createdProject.id,
        updates: { currentValue: 340 },
        actorUserId: "u_founder",
      });
    });

    const updatedProj = result.current.appState.state.projects.find((p) => p.id === createdProject.id);
    expect(updatedProj?.objectiveConfig?.currentValue).toBe(340);

    // 3. Create Deliverable with Scope Classification (Goodwill)
    let goodwillItem: any;
    await act(async () => {
      const res = await result.current.appState.createContentItem({
        projectId: createdProject.id,
        title: "Bonus Value-Add Reel",
        platform: "Instagram",
        contentType: "reel",
        stage: "draft",
        accountableOwnerId: "u_designer1",
        collaboratorIds: [],
        scopeClassification: "goodwill",
        deadlines: {
          submissionDeadline: new Date().toISOString(),
          scheduledPublicationDate: new Date().toISOString(),
        },
      });
      goodwillItem = res.item;
    });

    expect(goodwillItem.scopeClassification).toBe("goodwill");
  });
});
