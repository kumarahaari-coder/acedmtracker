import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import MyWorkDashboardPage from "@/app/(dashboard)/page";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

vi.mock("@/lib/actions/attendance", () => ({
  checkInAction: vi.fn(async ({ actorUserId }: any) => ({
    success: true,
    record: {
      id: "att_mock_1",
      userId: actorUserId || "u_designer1",
      attendanceDate: "2026-09-02",
      checkedInAt: new Date(),
      status: "checked_in",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })),
  checkOutAction: vi.fn(async ({ actorUserId }: any) => ({
    success: true,
    record: {
      id: "att_mock_1",
      userId: actorUserId || "u_designer1",
      attendanceDate: "2026-09-02",
      checkedInAt: new Date(),
      checkedOutAt: new Date(),
      status: "checked_out",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })),
}));

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

  it("2. Designer can click 'Check In Now' and transition immediately to 'Checked In'", async () => {
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
    await act(async () => {
      fireEvent.click(checkInBtn);
    });

    // Transitions to Checked In
    expect(await screen.findByText("Checked In")).toBeDefined();
    expect(await screen.findByText(/Checked in successfully for today/i)).toBeDefined();
    expect(await screen.findByText("Check Out for the Day")).toBeDefined();
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

  it("4. Designer can click 'Check Out for the Day' and transition to 'Checked Out'", async () => {
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
    await act(async () => {
      fireEvent.click(checkInBtn);
    });

    // 2. Check out
    const checkOutBtn = await screen.findByText("Check Out for the Day");
    await act(async () => {
      fireEvent.click(checkOutBtn);
    });

    expect(await screen.findByText("Checked Out")).toBeDefined();
    expect(await screen.findByText(/Shift Completed for Today/i)).toBeDefined();
  });
});
