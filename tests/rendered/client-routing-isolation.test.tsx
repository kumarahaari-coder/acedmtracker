import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardLayout from "@/app/(dashboard)/layout";
import PortalIndexPage from "@/app/portal/page";
import ClientPortalLayout from "@/app/portal/layout";
import ClientProjectOverviewPage from "@/app/portal/[projectId]/page";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "proj_acme" }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => "/portal/proj_acme",
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

describe("Client Routing & Workspace Isolation (QA Requirements)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it("1. Single-project Client accessing internal DashboardLayout does NOT render internal shell and redirects to /portal/[projectId]", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_acme">
            <DashboardLayout>
              <div data-testid="internal-content">Internal Workspace Content</div>
            </DashboardLayout>
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // Internal navigation and content must NOT render
    expect(screen.queryByTestId("internal-content")).toBeNull();
    expect(screen.queryByText("My Work")).toBeNull();
    expect(screen.queryByText("Performance")).toBeNull();
    expect(screen.queryByText("Organization Team")).toBeNull();

    // Transitional screen renders
    expect(screen.getByText("Entering Client Portal...")).toBeDefined();

    // Verifies immediate redirect to /portal/proj_acme
    expect(mockReplace).toHaveBeenCalledWith("/portal/proj_acme");
  });

  it("2. Single-project Client accessing /portal automatically forwards to /portal/[projectId] without workspace picker", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_acme">
            <PortalIndexPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // Verifies direct forwarding
    expect(mockPush).toHaveBeenCalledWith("/portal/proj_acme");
  });

  it("3. Single-project Client Portal header displays dedicated brand identity without a project dropdown switcher", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_acme">
            <ClientPortalLayout>
              <div>Portal View</div>
            </ClientPortalLayout>
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // Brand is prominently displayed
    expect(screen.getByText("Acme Healthcare Pvt Ltd")).toBeDefined();

    // Internal agency workspace link is NOT visible to Client
    expect(screen.queryByText("← Agency Workspace")).toBeNull();

    // No dropdown switcher exists for single-project client
    expect(screen.queryByText("Your Projects")).toBeNull();
  });

  it("4. Client with zero active memberships renders safe Client Portal empty state without internal shell", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client" userId="u_client_none">
            <PortalIndexPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    // Renders safe empty state
    expect(screen.getByText("No Active Portal Access")).toBeDefined();
    expect(screen.queryByText("My Work")).toBeNull();
    expect(screen.queryByText("Performance")).toBeNull();
  });
});
