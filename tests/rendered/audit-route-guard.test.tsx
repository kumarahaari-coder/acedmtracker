import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";
import AuditLogPage from "@/app/(dashboard)/projects/[projectId]/audit/page";
import { Sidebar } from "@/components/layout/Sidebar";

// Mock Next.js navigation hooks
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "proj_acme" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/projects/proj_acme/audit",
}));

// Helper component to switch active role inside provider
function RoleSwitchWrapper({ role, children }: { role: "founder" | "consultant" | "designer" | "client" | "admin"; children: React.ReactNode }) {
  const { setActiveRole } = useRole();
  React.useEffect(() => {
    setActiveRole(role);
  }, [role, setActiveRole]);

  return <>{children}</>;
}

describe("Rendered Audit Route Guard & Navigation Security", () => {
  it("renders full Audit History & Security Ledger when accessed by Founder", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder">
            <AuditLogPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Audit History & Security Ledger")).toBeDefined();
    expect(screen.getByText("Filter Events:")).toBeDefined();
  });

  it("renders 403 Forbidden Access Restricted screen when accessed by Designer", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer">
            <AuditLogPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("403 Forbidden")).toBeDefined();
    expect(screen.getByText("Internal Audit History Restricted")).toBeDefined();
    expect(screen.getByText(/strictly accessible only to authorized agency management/i)).toBeDefined();
    expect(screen.getByText("Return to Deliverables")).toBeDefined();
    expect(screen.queryByText("Filter Events:")).toBeNull();
  });

  it("renders 403 Forbidden Access Restricted screen when accessed by Client", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="client">
            <AuditLogPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("403 Forbidden")).toBeDefined();
    expect(screen.getByText("Internal Audit History Restricted")).toBeDefined();
    expect(screen.queryByText("Filter Events:")).toBeNull();
  });

  it("hides Audit Trail navigation link from Sidebar for Designer role", async () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="designer">
            <Sidebar projectId="proj_acme" />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.queryByText("Audit Trail")).toBeNull();
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Calendar")).toBeDefined();
  });
});
