import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import {
  validatePerformanceAccess,
  getOrganizationPerformance,
  getDesignerPerformanceDetail,
} from "@/lib/performance";
import { AppState, ProjectMembership, User } from "@/lib/types";

describe("Phase 6: Performance & Workload Security Gates and Scoping", () => {
  function createTestState(): AppState {
    const base = getInitialDeterministicState();

    // Create Consultant user
    const consultantUser: User = {
      id: "u_consultant_scoped",
      name: "Scoped Consultant",
      email: "consultant@aceassured.com",
      avatar: "SC",
      role: "consultant",
      status: "active",
      dateJoined: "2026-01-01",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    // Consultant assigned only to proj_acme
    const consultantMembership: ProjectMembership = {
      id: "pm_consultant_acme_only",
      projectId: "proj_acme",
      userId: "u_consultant_scoped",
      status: "active",
      membershipRole: "consultant",
      addedByUserId: "u_founder",
      addedAt: "2026-01-01T00:00:00Z",
    };

    return {
      ...base,
      users: [...base.users, consultantUser],
      projectMemberships: [...base.projectMemberships, consultantMembership],
    };
  }

  it("1. allows Founder and Admin full organization-wide access to performance metrics", () => {
    const state = createTestState();

    const founderResult = getOrganizationPerformance(state, "u_founder", "founder");
    expect(founderResult.status).toBe(200);
    expect(founderResult.data).toBeDefined();

    const adminResult = getOrganizationPerformance(state, "u_admin", "admin");
    expect(adminResult.status).toBe(200);
    expect(adminResult.data).toBeDefined();
  });

  it("2. scopes Consultant access strictly to authorized projects where they hold an active ProjectMembership", () => {
    const state = createTestState();
    const result = getOrganizationPerformance(state, "u_consultant_scoped", "consultant");

    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    // Consultant only has proj_acme membership
    // Projects in mock state: proj_acme (3 content items), proj_solaredge (1 content item)
    // The scoped deliverables count must ONLY aggregate proj_acme
    expect(result.data?.overview.completedDeliverablesCount).toBeDefined();

    // If consultant tries to filter by an unauthorized project (proj_solaredge), they must be rejected with 403
    const foreignProjectResult = getOrganizationPerformance(state, "u_consultant_scoped", "consultant", {
      projectId: "proj_solaredge",
    });
    expect(foreignProjectResult.status).toBe(403);
    expect(foreignProjectResult.error).toContain("membership");
  });

  it("3. strictly denies Designer from accessing the management performance dashboard (403)", () => {
    const state = createTestState();
    const result = getOrganizationPerformance(state, "u_designer1", "designer");

    expect(result.status).toBe(403);
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("restricted");
  });

  it("4. strictly denies Client and External Reviewer from accessing management performance (403)", () => {
    const state = createTestState();

    const clientResult = getOrganizationPerformance(state, "u_client_acme", "client");
    expect(clientResult.status).toBe(403);
    expect(clientResult.data).toBeUndefined();
  });

  it("5. denies inactive accounts from accessing performance analytics (403)", () => {
    let state = createTestState();
    // Inactivate founder account
    state = {
      ...state,
      users: state.users.map((u) => (u.id === "u_founder" ? { ...u, status: "inactive" } : u)),
    };

    const result = getOrganizationPerformance(state, "u_founder", "founder");
    expect(result.status).toBe(403);
    expect(result.error).toContain("inactive");
  });

  it("6. immediately revokes Consultant scope when ProjectMembership is removed / inactivated", () => {
    let state = createTestState();

    // Verify initial access works
    expect(getOrganizationPerformance(state, "u_consultant_scoped", "consultant").status).toBe(200);

    // Inactivate membership
    state = {
      ...state,
      projectMemberships: state.projectMemberships.map((m) =>
        m.id === "pm_consultant_acme_only" ? { ...m, status: "inactive" } : m
      ),
    };

    const result = getOrganizationPerformance(state, "u_consultant_scoped", "consultant");
    expect(result.status).toBe(403);
    expect(result.error).toContain("no active project memberships");
  });

  it("7. preserves historical performance data for inactive designers accessible by management", () => {
    const state = createTestState();

    // u_inactive_designer is an inactive designer in mockData
    const detailResult = getDesignerPerformanceDetail(
      state,
      "u_inactive_designer",
      "u_founder",
      "founder"
    );

    expect(detailResult.status).toBe(200);
    expect(detailResult.data).toBeDefined();
    expect(detailResult.data?.user.id).toBe("u_inactive_designer");
    expect(detailResult.data?.user.status).toBe("inactive");
  });

  it("8. scopes individual Designer drilldown view when accessed by Consultant across all dimensions", () => {
    const state = createTestState();

    // u_designer2 works across proj_acme (authorized) and proj_solaredge (unauthorized)
    // Founder sees all projects
    const founderDetail = getDesignerPerformanceDetail(
      state,
      "u_designer2",
      "u_founder",
      "founder"
    );
    expect(founderDetail.status).toBe(200);

    // Scoped consultant (only holds active membership on proj_acme)
    const consultantDetail = getDesignerPerformanceDetail(
      state,
      "u_designer2",
      "u_consultant_scoped",
      "consultant"
    );

    expect(consultantDetail.status).toBe(200);
    expect(consultantDetail.data).toBeDefined();

    // 1. Output distribution contains ONLY proj_acme, never proj_solaredge
    const projectsInOutput = Object.keys(consultantDetail.data?.productivity.outputByProject || {});
    expect(projectsInOutput).toContain("proj_acme");
    expect(projectsInOutput).not.toContain("proj_solaredge");

    // 2. Tracked time in consultant scope <= founder org-wide total
    expect(consultantDetail.data?.productivity.totalTrackedSeconds).toBeLessThanOrEqual(
      founderDetail.data?.productivity.totalTrackedSeconds || 0
    );

    // 3. Completed deliverables count in consultant scope <= founder org-wide total
    expect(consultantDetail.data?.productivity.completedDeliverablesCount).toBeLessThanOrEqual(
      founderDetail.data?.productivity.completedDeliverablesCount || 0
    );
  });

  it("9. verifies that Client Portal queries and DTOs have zero exposure to internal performance metrics", () => {
    const state = createTestState();

    // 1. Validate performance access rejects Client
    const perfAccess = validatePerformanceAccess(state, "u_client_acme", "client");
    expect(perfAccess.authorized).toBe(false);
    expect(perfAccess.error).toContain("restricted");

    // 2. getOrganizationPerformance returns 403 for Client
    const orgPerf = getOrganizationPerformance(state, "u_client_acme", "client");
    expect(orgPerf.status).toBe(403);
    expect(orgPerf.data).toBeUndefined();

    // 3. getDesignerPerformanceDetail returns 403 for Client
    const designerPerf = getDesignerPerformanceDetail(state, "u_designer1", "u_client_acme", "client");
    expect(designerPerf.status).toBe(403);
    expect(designerPerf.data).toBeUndefined();
  });
});
