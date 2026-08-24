import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import {
  validateClientProjectAccess,
  isContentEligibleForClient,
  filterMetricsByWhitelist,
  getClientProjectOverview,
  getClientCreativeLibrary,
  getClientCalendar,
  getClientAnalytics,
  getClientAssetAccess,
  DEFAULT_CLIENT_ALLOWED_METRICS,
} from "@/lib/client-portal";
import { AppState, ContentItem, Project, ProjectMembership, SubmissionVersion, User } from "@/lib/types";

describe("Phase 5: Authenticated Client Portal & Whitelisted Analytics Security Gates", () => {
  function createTestState(): AppState {
    const base = getInitialDeterministicState();

    // Create authenticated client user
    const clientUser: User = {
      id: "u_client_acme",
      name: "Dr. Ramesh Mehta",
      email: "ramesh@acmehealth.com",
      avatar: "R",
      role: "client",
      jobTitle: "Medical Director",
      status: "active",
      dateJoined: "2026-06-01",
      createdAt: "2026-06-01T08:00:00Z",
      updatedAt: "2026-06-01T08:00:00Z",
    };

    // Client membership for proj_acme only
    const clientMembership: ProjectMembership = {
      id: "pm_client_acme",
      projectId: "proj_acme",
      userId: "u_client_acme",
      status: "active",
      membershipRole: "client",
      addedByUserId: "u_founder",
      addedAt: "2026-06-01T08:00:00Z",
    };

    return {
      ...base,
      users: [...base.users, clientUser],
      projectMemberships: [...base.projectMemberships, clientMembership],
    };
  }

  it("1. allows authenticated Client with active ProjectMembership to access own project overview", () => {
    const state = createTestState();
    const result = getClientProjectOverview(state, "proj_acme", "u_client_acme", "client");

    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
    expect(result.data?.project.id).toBe("proj_acme");
    expect(result.data?.project.clientBrand).toBe("Acme Healthcare Pvt Ltd");
  });

  it("2. rejects Client attempting to access another client project (Project Isolation / Non-Enumeration)", () => {
    const state = createTestState();
    // Attempt to access proj_solaredge where client has no membership
    const result = getClientProjectOverview(state, "proj_solaredge", "u_client_acme", "client");

    expect(result.status).toBe(403);
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("Access denied");
  });

  it("3. immediately revokes portal access when Client ProjectMembership is removed / soft-inactivated", () => {
    let state = createTestState();

    // Verify initial access works
    expect(getClientProjectOverview(state, "proj_acme", "u_client_acme", "client").status).toBe(200);

    // Inactivate all memberships for u_client_acme
    state = {
      ...state,
      projectMemberships: state.projectMemberships.map((m) =>
        m.userId === "u_client_acme" ? { ...m, status: "inactive" } : m
      ),
    };

    const result = getClientProjectOverview(state, "proj_acme", "u_client_acme", "client");
    expect(result.status).toBe(403);
    expect(result.data).toBeUndefined();
  });

  it("4. blocks inactive client accounts from accessing the portal", () => {
    let state = createTestState();

    // Inactivate user account
    state = {
      ...state,
      users: state.users.map((u) => (u.id === "u_client_acme" ? { ...u, status: "inactive" } : u)),
    };

    const result = getClientProjectOverview(state, "proj_acme", "u_client_acme", "client");
    expect(result.status).toBe(403);
    expect(result.error).toContain("Account inactive");
  });

  it("5. strictly omits content items marked clientVisible === false from creative library", () => {
    const state = createTestState();
    const result = getClientCreativeLibrary(state, "proj_acme", "u_client_acme", "client");

    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    // In mock data, item_acme_1 has clientVisible === false (changes_requested draft)
    const hasHiddenItem = result.data?.some((c) => c.id === "item_acme_1");
    expect(hasHiddenItem).toBe(false);

    // item_acme_2, item_acme_3, item_acme_4 have clientVisible === true
    const hasVisibleItem = result.data?.some((c) => c.id === "item_acme_3");
    expect(hasVisibleItem).toBe(true);
  });

  it("6. never returns internal draft, idea, or working draft versions even if clientVisible is true", () => {
    const draftItem: ContentItem = {
      id: "item_draft_test",
      projectId: "proj_acme",
      title: "Unfinished Draft",
      platform: "Instagram",
      contentType: "post",
      stage: "draft",
      accountableOwnerId: "u_designer1",
      collaboratorIds: [],
      deadlines: {},
      currentVersionNumber: 1,
      clientVisible: true, // Accidental flag
    };

    const draftVersion: SubmissionVersion = {
      id: "ver_draft",
      contentItemId: "item_draft_test",
      versionNumber: 1,
      isDraft: true,
      createdAt: new Date().toISOString(),
      copy: { caption: "Draft", hashtags: [], cta: "" },
      creativeAssets: [],
      componentFingerprints: { copyFingerprint: "1", creativeFingerprint: "2", postingDateFingerprint: "3" },
    };

    const eligible = isContentEligibleForClient(draftItem, draftVersion);
    expect(eligible).toBe(false);
  });

  it("7. verifies data minimization: Client DTOs do NOT leak internal comments, timers, attendance, or override reasons", () => {
    const state = createTestState();
    const overview = getClientProjectOverview(state, "proj_acme", "u_client_acme", "client");
    const creatives = getClientCreativeLibrary(state, "proj_acme", "u_client_acme", "client");

    // Client responses contain no internal operational arrays
    expect((overview.data as any)?.workSessions).toBeUndefined();
    expect((overview.data as any)?.attendanceRecords).toBeUndefined();
    expect((overview.data as any)?.auditRecords).toBeUndefined();
    expect((overview.data as any)?.founderOverrides).toBeUndefined();

    for (const c of creatives.data || []) {
      expect((c as any).workSessions).toBeUndefined();
      expect((c as any).internalComments).toBeUndefined();
      expect((c as any).changeRequests).toBeUndefined();
    }
  });

  it("8. filters Client Analytics strictly against the project allowedMetricKeys whitelist", () => {
    const state = createTestState();
    const result = getClientAnalytics(state, "proj_acme", "u_client_acme", "client");

    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    // Default whitelist: reach, impressions, engagementRate, clicks, leads
    expect(result.data?.totals.reach).toBeDefined();
    expect(result.data?.totals.impressions).toBeDefined();

    // Commercial metrics revenue and roas are NOT whitelisted by default -> MUST BE OMITTED
    expect(result.data?.totals.revenue).toBeUndefined();
    expect(result.data?.totals.roas).toBeUndefined();
  });

  it("9. includes revenue in Client Analytics when explicitly whitelisted by management", () => {
    let state = createTestState();

    // Update project whitelist to include revenue
    state = {
      ...state,
      projects: state.projects.map((p) =>
        p.id === "proj_acme"
          ? { ...p, clientAnalyticsConfig: { allowedMetricKeys: ["reach", "impressions", "revenue"] } }
          : p
      ),
    };

    const result = getClientAnalytics(state, "proj_acme", "u_client_acme", "client");
    expect(result.status).toBe(200);
    expect(result.data?.totals.revenue).toBeDefined();
    expect(result.data?.totals.clicks).toBeUndefined(); // Clicks excluded since not in new whitelist
  });

  it("10. authorizes Client to access eligible assets in their own project but rejects another project's assets", () => {
    const state = createTestState();

    // Retrieve asset belonging to proj_acme's item_acme_3
    const ownAssetResult = getClientAssetAccess(state, "proj_acme", "ast_4", "u_client_acme", "client");
    expect(ownAssetResult.status).toBe(200);
    expect(ownAssetResult.asset?.assetId).toBe("ast_4");

    // Attempt to retrieve asset belonging to proj_solaredge
    const foreignAssetResult = getClientAssetAccess(state, "proj_solaredge", "ast_solar_1", "u_client_acme", "client");
    expect(foreignAssetResult.status).toBe(403);
  });
});
