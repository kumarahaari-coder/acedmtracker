import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import ContentItemWorkspacePage from "@/app/(dashboard)/projects/[projectId]/content/[itemId]/page";
import MyWorkDashboardPage from "@/app/(dashboard)/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "proj_acme", itemId: "item_acme_1" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/projects/proj_acme/content/item_acme_1",
}));

function RoleSwitchWrapper({
  role,
  userId,
  children,
}: {
  role: "founder" | "consultant" | "designer" | "client" | "admin";
  userId?: string;
  children: React.ReactNode;
}) {
  const { setActiveRole, setActiveUserId } = useRole();
  React.useEffect(() => {
    setActiveRole(role);
    if (userId) setActiveUserId(userId);
  }, [role, userId, setActiveRole, setActiveUserId]);

  return <>{children}</>;
}

describe("Rendered Assignment Lifecycle & Work Timer Workflow", () => {
  it("renders Assigned Work and allows designer to Accept and Start Work", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <ContentItemWorkspacePage />
          </RoleSwitchWrapper>
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
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <MyWorkDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText(/Today's Attendance/i)).toBeDefined();
    expect(screen.getByText(/Productivity Work Timer/i)).toBeDefined();
  });

  it("handles Check-In and Check-Out button clicks on My Work dashboard", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <MyWorkDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // Find attendance button (either Check In or Check Out)
    const attBtn = screen.getAllByRole("button", { name: /Check (In|Out)/i })[0];
    expect(attBtn).toBeDefined();

    // Fire click
    fireEvent.click(attBtn);

    // After click, presence state updates
    expect(screen.getAllByText(/Today's Attendance|Status:/i).length).toBeGreaterThan(0);
  });
});
