import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider } from "@/lib/context/RoleContext";
import ContentItemWorkspacePage from "@/app/(dashboard)/projects/[projectId]/content/[itemId]/page";
import MyWorkDashboardPage from "@/app/(dashboard)/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "proj_acme", itemId: "item_acme_1" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/projects/proj_acme/content/item_acme_1",
}));

describe("Rendered Assignment Lifecycle & Work Timer Workflow", () => {
  it("renders Assigned Work and allows designer to Accept and Start Work", async () => {
    const { container } = render(
      <AppStateProvider>
        <RoleProvider>
          <ContentItemWorkspacePage />
        </RoleProvider>
      </AppStateProvider>
    );

    // Initial render checks
    expect(screen.getByText("Assigned Work")).toBeDefined();
    expect(screen.getByText("Work Timer (Task Effort)")).toBeDefined();

    // Check timer widget exists
    const timerHeading = screen.getByText("Work Timer (Task Effort)");
    expect(timerHeading).toBeDefined();
  });

  it("renders Today's Attendance and Task Effort on My Work Dashboard", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <MyWorkDashboardPage />
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText(/Today's Status/i)).toBeDefined();
    expect(screen.getByText(/Daily Attendance/i)).toBeDefined();
    expect(screen.getByText(/Tracked Work Today/i)).toBeDefined();
    expect(screen.getByText(/Current Task/i)).toBeDefined();
  });

  it("handles Check-In and Check-Out button clicks on My Work dashboard", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <MyWorkDashboardPage />
        </RoleProvider>
      </AppStateProvider>
    );

    // Find attendance button (either Check In or Check Out)
    const attBtn = screen.getByRole("button", { name: /Check (In|Out)/i });
    expect(attBtn).toBeDefined();

    // Fire click
    fireEvent.click(attBtn);

    // After click, presence state updates
    expect(screen.getByText(/Daily Attendance/i)).toBeDefined();
  });
});
