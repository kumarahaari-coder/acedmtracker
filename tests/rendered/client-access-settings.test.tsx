import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectSettingsPage from "@/app/(dashboard)/projects/[projectId]/settings/page";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider, useRole } from "@/lib/context/RoleContext";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "proj_acme" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
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

describe("Rendered Project Settings — Client Access Flow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders Client Access section with '+ Add Client' and existing client contacts", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <ProjectSettingsPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Client Access")).toBeDefined();
    expect(screen.getByText("+ Add Client")).toBeDefined();
    expect(screen.getByText("Client Analytics")).toBeDefined();
    expect(screen.getByText("Assigned Project Team")).toBeDefined();
  });

  it("opens Add Client modal with Name, Email, Job Title, and Phone inputs", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <ProjectSettingsPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    const addClientBtn = screen.getByText("+ Add Client");
    fireEvent.click(addClientBtn);

    expect(screen.getByText("Add Client to Project")).toBeDefined();
    expect(screen.getByPlaceholderText("e.g. Sarah Johnson")).toBeDefined();
    expect(screen.getByPlaceholderText("e.g. sarah@clientbrand.com")).toBeDefined();
    expect(screen.getByPlaceholderText("e.g. VP Marketing, Brand Lead")).toBeDefined();
    expect(screen.getByText("Grant Portal Access")).toBeDefined();
  });

  it("shows email collision error when attempting to add an internal employee email as a client", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <RoleSwitchWrapper role="founder" userId="u_founder">
            <ProjectSettingsPage />
          </RoleSwitchWrapper>
        </RoleProvider>
      </AppStateProvider>
    );

    const addClientBtn = screen.getByText("+ Add Client");
    fireEvent.click(addClientBtn);

    const nameInput = screen.getByPlaceholderText("e.g. Sarah Johnson");
    const emailInput = screen.getByPlaceholderText("e.g. sarah@clientbrand.com");
    const submitBtn = screen.getByText("Grant Portal Access");

    // Enter rohan's designer email
    fireEvent.change(nameInput, { target: { value: "Rohan Verma" } });
    fireEvent.change(emailInput, { target: { value: "rohan@aceassured.com" } });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/already registered as an internal team member/i)
    ).toBeDefined();
  });
});
