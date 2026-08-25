import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MyWorkDashboardPage from "@/app/(dashboard)/page";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "proj_acme" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
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

describe("Rendered Attendance Card & Timer Decoupling (ATT-001 & ATT-002)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("1. Renders Today's Attendance card and productivity timer card as distinct panels", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <MyWorkDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Today's Attendance")).toBeDefined();
    expect(screen.getByText("Productivity Work Timer")).toBeDefined();
  });

  it("2. Designer can click 'Check In Now' and transition immediately to 'Checked In'", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <MyWorkDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // Initial state
    const checkInBtn = screen.getByText("Check In Now");
    fireEvent.click(checkInBtn);

    // Transitions to Checked In
    expect(screen.getByText("Checked In")).toBeDefined();
    expect(screen.getByText(/Checked in successfully for today/i)).toBeDefined();
    expect(screen.getByText("Check Out for the Day")).toBeDefined();
  });

  it("3. Check In does not start a task work session", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <MyWorkDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    const checkInBtn = screen.getByText("Check In Now");
    fireEvent.click(checkInBtn);

    // Timer remains idle
    expect(screen.getByText("Timer Idle")).toBeDefined();
    expect(screen.getByText("No task timer running.")).toBeDefined();
  });

  it("4. Designer can click 'Check Out for the Day' and transition to 'Checked Out'", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <MyWorkDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // 1. Check in
    const checkInBtn = screen.getByText("Check In Now");
    fireEvent.click(checkInBtn);

    // 2. Check out
    const checkOutBtn = screen.getByText("Check Out for the Day");
    fireEvent.click(checkOutBtn);

    expect(screen.getByText("Checked Out")).toBeDefined();
    expect(screen.getByText(/Shift Completed for Today/i)).toBeDefined();
  });
});
