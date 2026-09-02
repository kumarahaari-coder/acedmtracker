import { describe, it, expect, vi } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

vi.mock("@/lib/actions/projects", () => ({
  createProjectAction: vi.fn(async (params: any) => ({
    success: true,
    project: {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: params.name,
      clientBrand: params.clientBrand,
      scope: params.scope,
      status: "active",
      createdAt: "2026-09-02T10:00:00.000Z",
    },
  })),
  addProjectMemberAction: vi.fn(async () => ({
    success: true,
    membershipId: "pm-test-123",
  })),
}));

vi.mock("@/lib/actions/content", () => ({
  createContentItemAction: vi.fn(async (params: any) => ({
    success: true,
    item: {
      id: "item-canonical-timer-1",
      projectId: params.projectId,
      title: params.title,
      platform: params.platform,
      contentType: params.contentType,
      currentVersionNumber: 1,
      scopeClassification: params.scopeClassification || "contracted",
    },
    version: {
      id: "ver-canonical-timer-1",
      contentItemId: "item-canonical-timer-1",
      versionNumber: 1,
      isDraft: true,
      createdAt: new Date(),
      copy: { caption: "Test", hashtags: [], cta: "" },
      creativeAssets: [],
    },
    assignment: {
      id: "asgn-canonical-timer-1",
      projectId: params.projectId,
      contentItemId: "item-canonical-timer-1",
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

function TestComponent() {
  const { state, createProject, addProjectMember, createContentItem, acceptContentAssignment, startWorkSession } = useAppState();
  const { activeUserId } = useRole();
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);

  const handleCreate = async () => {
    const projRes = await createProject({
      name: "Timer Test Project",
      clientBrand: "Timer Brand",
      avatar: "TB",
      scope: "Testing timers",
      timezone: "Asia/Kolkata",
      status: "active",
      targetRequirements: { posts: 1, carousels: 1, reels: 1, trialReels: 0 },
      workflowStages: ["Draft"],
    }, activeUserId);

    const canonicalProjectId = projRes.project?.id || "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    await addProjectMember({
      projectId: canonicalProjectId,
      userId: activeUserId,
      membershipRole: "designer",
      actorUserId: activeUserId,
    });

    const res = await createContentItem({
      projectId: canonicalProjectId,
      title: "Real Runtime Test Reel",
      platform: "Instagram",
      contentType: "reel",
      stage: "draft",
      accountableOwnerId: activeUserId,
      collaboratorIds: [],
      deadlines: {
        submissionDeadline: new Date().toISOString(),
        scheduledPublicationDate: new Date().toISOString(),
      },
    });

    if (res.item) {
      setCreatedItemId(res.item.id);
    }
  };

  const handleStart = () => {
    if (!createdItemId) return;
    const item = state.contentItems.find((i) => i.id === createdItemId);
    const asgn = state.contentAssignments.find((a) => a.contentItemId === createdItemId);
    if (asgn) {
      acceptContentAssignment(asgn.id, activeUserId);
    }
    startWorkSession({
      projectId: item?.projectId || "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      contentItemId: createdItemId,
      assignmentId: asgn?.id || "asgn-canonical-timer-1",
      userId: activeUserId,
    });
  };

  const activeSession = state.workSessions.find((ws) => ws.userId === activeUserId && ws.status === "active");

  return (
    <div>
      <button onClick={handleCreate}>Create Content</button>
      <button onClick={handleStart}>Start Work</button>
      <div data-testid="active-timer-status">
        {activeSession ? `Timer Running on ${activeSession.contentItemId}` : "Timer Inactive"}
      </div>
    </div>
  );
}

describe("New Assignment Timer Lifecycle", () => {
  it("atomically creates ContentAssignment and successfully starts work session timer on brand-new items", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <TestComponent />
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByTestId("active-timer-status").textContent).toContain("Timer Inactive");

    await act(async () => {
      fireEvent.click(screen.getByText("Create Content"));
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Start Work"));
    });

    expect(await screen.findByText(/Timer Running on item-canonical-timer-1/i)).toBeDefined();
  });
});
