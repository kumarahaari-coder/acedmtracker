import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import PerformanceDashboardPage from "@/app/(dashboard)/performance/page";
import DesignerPerformanceDetailPage from "@/app/(dashboard)/performance/[userId]/page";
import ProjectPerformancePage from "@/app/(dashboard)/projects/[projectId]/performance/page";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ userId: "u_designer1", projectId: "proj_acme" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/performance",
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

describe("Rendered Performance Dashboard & Drilldown Flow", () => {
  it("renders Global Performance Dashboard with team KPIs and Scorecard table as Founder", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <PerformanceDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText(/Team Performance & Capacity/i)).toBeDefined();
    expect(screen.getByText(/Completed Output/i)).toBeDefined();
    expect(screen.getByText(/On-Time Delivery/i)).toBeDefined();
    expect(screen.getByText(/First-Pass Approval/i)).toBeDefined();
    expect(screen.getByText(/Avg Revision Cycles/i)).toBeDefined();
    expect(screen.getByText(/Avg Production Time/i)).toBeDefined();
    expect(screen.getByText(/Team Presence Today/i)).toBeDefined();

    // Scorecards Table
    expect(screen.getByText(/Designer Performance Scorecards/i)).toBeDefined();
    expect(screen.getAllByText("Rohan Verma").length).toBeGreaterThan(0);
  });

  it("switches to Live Workload & Capacity view on button click", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <PerformanceDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // Switch to Workload view
    const workloadButton = screen.getByRole("button", { name: /Live Workload & Capacity/i });
    fireEvent.click(workloadButton);

    expect(screen.getByText(/Real-Time Workload & Capacity Board/i)).toBeDefined();
  });

  it("renders Individual Designer Performance Drilldown page (/performance/[userId])", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <DesignerPerformanceDetailPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Rohan Verma")).toBeDefined();
    expect(screen.getByText(/A. Productivity & Output Effort/i)).toBeDefined();
    expect(screen.getByText(/B. Delivery Reliability & Deadlines/i)).toBeDefined();
    expect(screen.getByText(/C. Review Efficiency & Revisions/i)).toBeDefined();
    expect(screen.getByText(/D. Presence & Daily Context/i)).toBeDefined();
  });

  it("renders Project-specific Performance page (/projects/[projectId]/performance)", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <ProjectPerformancePage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText(/Acme Health Omnichannel Performance/i)).toBeDefined();
    expect(screen.getByText(/Assigned Team Performance/i)).toBeDefined();
  });

  it("denies Designer from accessing the Performance Dashboard (403)", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer" userId="u_designer1">
            <PerformanceDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Access Restricted")).toBeDefined();
    expect(screen.queryByText(/Designer Performance Scorecards/i)).toBeNull();
  });
});
