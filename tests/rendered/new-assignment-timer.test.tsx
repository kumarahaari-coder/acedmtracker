import { describe, it, expect } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

function TestComponent() {
  const { state, createContentItem, acceptContentAssignment, startWorkSession } = useAppState();
  const { activeUserId } = useRole();
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);

  const handleCreate = () => {
    const newItem = createContentItem({
      projectId: "proj_acme",
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
    setCreatedItemId(newItem.id);
  };

  const handleStart = () => {
    if (!createdItemId) return;
    const asgn = state.contentAssignments.find((a) => a.contentItemId === createdItemId);
    if (asgn) {
      acceptContentAssignment(asgn.id, activeUserId);
    }
    startWorkSession({
      projectId: "proj_acme",
      contentItemId: createdItemId,
      assignmentId: asgn?.id || "",
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
  it("atomically creates ContentAssignment and successfully starts work session timer on brand-new items", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <TestComponent />
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByTestId("active-timer-status").textContent).toContain("Timer Inactive");

    act(() => {
      fireEvent.click(screen.getByText("Create Content"));
    });

    act(() => {
      fireEvent.click(screen.getByText("Start Work"));
    });

    expect(screen.getByTestId("active-timer-status").textContent).toContain("Timer Running");
  });
});
