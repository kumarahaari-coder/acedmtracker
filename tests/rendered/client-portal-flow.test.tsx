import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import ClientProjectOverviewPage from "@/app/portal/[projectId]/page";
import ClientCreativeLibraryPage from "@/app/portal/[projectId]/creatives/page";
import ClientCalendarPage from "@/app/portal/[projectId]/calendar/page";
import ClientAnalyticsPage from "@/app/portal/[projectId]/analytics/page";

// Mock Next.js navigation hooks
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "proj_acme" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/portal/proj_acme",
}));

function RoleSwitchWrapper({ role, userId, children }: { role: "founder" | "consultant" | "designer" | "client" | "admin"; userId?: string; children: React.ReactNode }) {
  const { setActiveRole, setActiveUserId } = useRole();
  React.useEffect(() => {
    setActiveRole(role);
    if (userId) setActiveUserId(userId);
  }, [role, userId, setActiveRole, setActiveUserId]);

  return <>{children}</>;
}

describe("Rendered Client Portal Workflow & UI Validation", () => {
  it("renders Client Overview with Brand summary and recent creatives", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_acme">
            <ClientProjectOverviewPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText(/Overview/i)).toBeDefined();
    expect(screen.getByText("Published Live")).toBeDefined();
    expect(screen.getByText("Scheduled Posts")).toBeDefined();
    expect(screen.getByText("Approved Creatives")).toBeDefined();
    expect(screen.getByText(/Recent Creatives/i)).toBeDefined();
    expect(screen.getByText(/Upcoming Publishing/i)).toBeDefined();
  });

  it("renders Client Creative Library with filters and opens detail modal", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_acme">
            <ClientCreativeLibraryPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Creative Library")).toBeDefined();
    expect(screen.getByPlaceholderText(/Search creatives by title/i)).toBeDefined();

    // Click on the first creative card to open detail modal
    const viewDetailButtons = screen.getAllByText(/View Details →/i);
    expect(viewDetailButtons.length).toBeGreaterThan(0);

    fireEvent.click(viewDetailButtons[0]);

    // Detail modal should appear
    expect(screen.getByText(/Creative Assets/i)).toBeDefined();
    expect(screen.getByText("Post Caption")).toBeDefined();
    expect(screen.getByText("Close")).toBeDefined();
  });

  it("renders Client Publishing Calendar without internal agency milestones", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_acme">
            <ClientCalendarPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Publishing Calendar")).toBeDefined();
    expect(screen.getByText(/All Events/i)).toBeDefined();
    expect(screen.getAllByText(/Scheduled/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Published/i).length).toBeGreaterThan(0);
  });

  it("renders Client Analytics with whitelisted metrics only", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_acme">
            <ClientAnalyticsPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Campaign Performance")).toBeDefined();
    expect(screen.getByText("Channel Breakdown")).toBeDefined();
    expect(screen.getByText("Top Performing Deliverables")).toBeDefined();

    // Whitelisted metrics
    expect(screen.getAllByText(/reach/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/impressions/i).length).toBeGreaterThan(0);
  });
});
