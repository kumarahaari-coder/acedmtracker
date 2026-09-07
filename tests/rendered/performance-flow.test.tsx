import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import PerformanceDashboardPage from "@/app/(dashboard)/performance/page";
import TeamCapacityPage from "@/app/(dashboard)/performance/team/page";
import ProjectsPerformancePage from "@/app/(dashboard)/performance/projects/page";
import EffortAnalysisPage from "@/app/(dashboard)/performance/effort/page";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ userId: "u_designer1", projectId: "proj_acme" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Server Actions for Render Testing
vi.mock("@/lib/actions/performance", () => ({
  getAuthoritativePerformanceOverviewAction: vi.fn().mockResolvedValue({
    success: true,
    overview: {
      teamCapacityHours: 160,
      teamAssignedHours: 120,
      teamActualHours: 100,
      teamRemainingHours: 40,
      teamAllocationPercent: 75,
      teamUtilizationPercent: 62.5,
      completedTasksCount: 15,
      onTimePercent: 93.3,
      reworkIncidencePercent: 12.5,
      adHocHours: 8,
      goodwillHours: 4,
      overdueTasksCount: 1,
      activeTimersCount: 2,
      employeeScorecards: [
        {
          user: { id: "u_1", name: "Irfan Creative", role: "designer" },
          capacity: { finalCapacityHours: 40, primaryFunction: "Creative", creativeEligibility: "primary" },
          assignedPlannedHours: 30,
          actualLoggedHours: 25,
          remainingPlannedHours: 10,
          allocationPercent: 75,
          utilizationPercent: 62.5,
          capacityStatus: "Available",
          completedTasksCount: 5,
          onTimeDeliveredCount: 5,
          onTimePercent: 100,
          efficiencyPercent: 120,
          efficiencyDetails: { totalCompletedPlannedHours: 12, totalCompletedActualHours: 10, varianceHours: 2 },
          reworkIncidencePercent: 0,
          firstPassApprovalPercent: 100,
          revisionRoundsAvg: null,
          adHocHours: 2,
          goodwillHours: 0,
          assignedTasks: [],
          completedTasks: [],
          workSessions: [],
        },
      ],
    },
    projectScorecards: [
      {
        project: { id: "p_1", name: "Acme Healthcare", clientBrand: "Acme Health", status: "active" },
        plannedTasksCount: 10,
        completedTasksCount: 8,
        pendingTasksCount: 2,
        overdueTasksCount: 0,
        plannedHours: 35,
        actualHours: 30,
        varianceHours: 5,
        adHocHours: 3,
        goodwillHours: 0,
        completionPercent: 80,
        commitments: [{ workTypeName: "Short-form Reel", committedQuantity: 4, fulfilledContractedQuantity: 3, percent: 75 }],
      },
    ],
  }),
  getAuthoritativeTeamCapacityAction: vi.fn().mockResolvedValue({
    success: true,
    scorecards: [
      {
        user: { id: "u_1", name: "Irfan Creative", role: "designer" },
        capacity: { finalCapacityHours: 40, primaryFunction: "Creative", creativeEligibility: "primary" },
        assignedPlannedHours: 30,
        actualLoggedHours: 25,
        remainingPlannedHours: 10,
        allocationPercent: 75,
        utilizationPercent: 62.5,
        capacityStatus: "Available",
        completedTasksCount: 5,
        onTimePercent: 100,
        efficiencyPercent: 120,
      },
    ],
  }),
  getAuthoritativeProjectsPerformanceAction: vi.fn().mockResolvedValue({
    success: true,
    projectScorecards: [
      {
        project: { id: "p_1", name: "Acme Healthcare", clientBrand: "Acme Health", status: "active" },
        plannedTasksCount: 10,
        completedTasksCount: 8,
        plannedHours: 35,
        actualHours: 30,
        varianceHours: 5,
        adHocHours: 3,
        completionPercent: 80,
        commitments: [{ workTypeName: "Short-form Reel", committedQuantity: 4, fulfilledContractedQuantity: 3, percent: 75 }],
      },
    ],
  }),
  getAuthoritativeEffortAnalysisAction: vi.fn().mockResolvedValue({
    success: true,
    analysisRows: [
      {
        workType: "Short-form Reel",
        category: "Video",
        standardBaseHours: 3.75,
        averageActualHours: 3.2,
        varianceHours: 0.55,
        completedTasksCount: 8,
      },
    ],
  }),
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

describe("Rendered Performance Dashboard & Subviews Flow", () => {
  it("renders Global Performance Overview Dashboard with authoritative KPIs", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <PerformanceDashboardPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Performance & Capacity")).toBeDefined();
    expect(screen.getAllByText("Team Capacity").length).toBeGreaterThan(0);
    expect(screen.getByText("Assigned Effort")).toBeDefined();
    expect(screen.getByText("Actual Tracked")).toBeDefined();
    expect(screen.getByText("Completed Tasks")).toBeDefined();
  });

  it("renders Team Capacity performance subview (/performance/team)", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <TeamCapacityPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Team Capacity & Allocation")).toBeDefined();
  });

  it("renders Projects performance subview (/performance/projects)", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <ProjectsPerformancePage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Projects Operational Performance")).toBeDefined();
  });

  it("renders Effort Analysis performance subview (/performance/effort)", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <EffortAnalysisPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Effort Standards vs Actuals Analysis")).toBeDefined();
  });
});
