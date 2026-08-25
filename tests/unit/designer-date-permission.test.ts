import { describe, it, expect } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

describe("Designer Permissions & Date Protection", () => {
  it("rejects Designer attempts to modify publishing dates or update publication details", () => {
    const { result } = renderHook(
      () => {
        const appState = useAppState();
        const role = useRole();
        return { appState, role };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(
            AppStateProvider,
            null,
            React.createElement(RoleProvider, null, children)
          ),
      }
    );

    // Switch role to Designer
    act(() => {
      result.current.role.setActiveRole("designer");
      result.current.role.setActiveUserId("u_designer1");
    });

    const designerId = result.current.role.activeUserId;
    const testItemId = result.current.appState.state.contentItems[0].id;
    const originalItem = result.current.appState.state.contentItems.find((i) => i.id === testItemId)!;
    const originalDate = originalItem.deadlines.scheduledPublicationDate;

    // Designer attempts to change scheduled_publication deadline
    act(() => {
      result.current.appState.updateDeadline({
        contentItemId: testItemId,
        kind: "scheduled_publication",
        newDueAt: "2026-12-31T18:00:00Z",
        changedByUserId: designerId,
        reason: "Designer unauthorized date change attempt",
      });
    });

    const afterItem = result.current.appState.state.contentItems.find((i) => i.id === testItemId)!;
    expect(afterItem.deadlines.scheduledPublicationDate).toBe(originalDate);

    // Designer attempts updatePublicationDetails
    let pubResult: any;
    act(() => {
      pubResult = result.current.appState.updatePublicationDetails({
        contentItemId: testItemId,
        publishedAt: "2026-12-31T18:00:00Z",
        reason: "Designer unauthorized publication details update",
        actorUserId: designerId,
      });
    });

    expect(pubResult.success).toBe(false);
    expect(pubResult.error).toContain("Unauthorized");

    // Designer attempts to generate external review link
    expect(() => {
      result.current.appState.generateExternalReviewLink({
        projectId: "proj_acme",
        contentItemId: testItemId,
        submissionVersionId: originalItem.activeDraftVersionId || "ver_1",
        createdByUserId: designerId,
        allowDownload: true,
      });
    }).toThrow("Unauthorized");
  });
});
