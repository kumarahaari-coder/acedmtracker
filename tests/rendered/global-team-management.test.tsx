import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider } from "@/lib/context/RoleContext";
import GlobalTeamPage from "@/app/(dashboard)/team/page";
import TeamMemberProfilePage from "@/app/(dashboard)/team/[userId]/page";
import ProjectSettingsPage from "@/app/(dashboard)/projects/[projectId]/settings/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ userId: "u_designer1", projectId: "proj_acme" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/team",
}));

describe("Rendered Global Team Management & Profile Workflows", () => {
  it("renders Global Team directory with Today's Attendance bar", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <GlobalTeamPage />
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Organization Team")).toBeDefined();
    expect(screen.getByText(/Today's Attendance & Activity/i)).toBeDefined();
    expect(screen.getByText("Add Team Member")).toBeDefined();
  });

  it("opens Add Team Member modal on /team", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <GlobalTeamPage />
        </RoleProvider>
      </AppStateProvider>
    );

    const addBtn = screen.getByRole("button", { name: /Add Team Member/i });
    fireEvent.click(addBtn);

    expect(screen.getByText("Add Organization Team Member")).toBeDefined();
    expect(screen.getByPlaceholderText("e.g. Vikram Sharma")).toBeDefined();
  });

  it("renders Employee Profile /team/[userId] with Project Memberships and Attendance", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <TeamMemberProfilePage />
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Project Memberships")).toBeDefined();
    expect(screen.getByText("Personnel Details")).toBeDefined();
    expect(screen.getByText(/Deliverables & Assignments/i)).toBeDefined();
    expect(screen.getByText(/Attendance History/i)).toBeDefined();
  });

  it("renders Project Settings focusing only on project team membership", () => {
    render(
      <AppStateProvider>
        <RoleProvider>
          <ProjectSettingsPage />
        </RoleProvider>
      </AppStateProvider>
    );

    expect(screen.getByText("Project Settings")).toBeDefined();
    expect(screen.getByText("Assigned Project Team")).toBeDefined();
    expect(screen.getByText("Add Existing Team Member")).toBeDefined();
  });
});
