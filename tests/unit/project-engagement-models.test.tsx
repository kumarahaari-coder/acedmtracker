import { describe, it, expect } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

describe("Project Engagement Models & Goodwill Tracking", () => {
  it("supports creating Deliverable-Based and Objective-Based projects and tracking objective milestones", () => {
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
    act(() => {
      createdProject = result.current.appState.createProject({
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
    act(() => {
      goodwillItem = result.current.appState.createContentItem({
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
    });

    expect(goodwillItem.scopeClassification).toBe("goodwill");
  });
});
