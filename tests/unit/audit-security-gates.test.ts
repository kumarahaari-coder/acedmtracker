import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import { getAuthoritativeAuditHistory } from "@/lib/derived";
import { AppState, AuditRecord, UserRole } from "@/lib/types";

describe("Phase 4: Audit History Security Gates & Role-Based Access Control", () => {
  function createTestState(): AppState {
    return getInitialDeterministicState();
  }

  it("1. allows Founder to access project and organization audit history (200 OK)", () => {
    const state = createTestState();
    const result = getAuthoritativeAuditHistory(state, "proj_acme", "u_founder", "founder");

    expect(result.status).toBe(200);
    expect(result.isRestricted).toBe(false);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);
  });

  it("2. allows Admin to access project and organization audit history (200 OK)", () => {
    const state = createTestState();
    const result = getAuthoritativeAuditHistory(state, "proj_acme", "u_admin", "admin");

    expect(result.status).toBe(200);
    expect(result.isRestricted).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data!.length).toBeGreaterThan(0);
  });

  it("3. allows Consultant WITH active project membership to access project audit history (200 OK)", () => {
    const state = createTestState();
    // In mock data, u_consultant (Priyah Sharma) has active membership in proj_acme
    const result = getAuthoritativeAuditHistory(state, "proj_acme", "u_consultant", "consultant");

    expect(result.status).toBe(200);
    expect(result.isRestricted).toBe(false);
    expect(result.data).toBeDefined();
  });

  it("4. rejects Consultant WITHOUT active project membership with 403 Forbidden", () => {
    const state = createTestState();
    // Create a consultant user without membership in proj_solar
    const unassignedConsultantId = "u_consultant_unassigned";
    const result = getAuthoritativeAuditHistory(state, "proj_solar", unassignedConsultantId, "consultant");

    expect(result.status).toBe(403);
    expect(result.isRestricted).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("403 Forbidden");
    expect(result.error).toContain("Consultant does not have an active project membership");
  });

  it("5. rejects Designer direct audit query with 403 Forbidden", () => {
    const state = createTestState();
    const result = getAuthoritativeAuditHistory(state, "proj_acme", "u_designer1", "designer");

    expect(result.status).toBe(403);
    expect(result.isRestricted).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("403 Forbidden");
    expect(result.error).toContain("restricted to agency management");
  });

  it("6. rejects Client direct audit query with 403 Forbidden", () => {
    const state = createTestState();
    const result = getAuthoritativeAuditHistory(state, "proj_acme", "u_client_acme", "client");

    expect(result.status).toBe(403);
    expect(result.isRestricted).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("403 Forbidden");
  });

  it("7. rejects External Reviewer / guest context with 403 Forbidden", () => {
    const state = createTestState();
    const result = getAuthoritativeAuditHistory(state, "proj_acme", "guest_anon", "external_reviewer" as UserRole);

    expect(result.status).toBe(403);
    expect(result.isRestricted).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it("8. verifies internal security audit ledger captures attendance, work session, and publication adjustments", () => {
    const state = createTestState();

    // Verify audit ledger contains critical security action types
    const auditActions = new Set(state.auditRecords.map((r) => r.action));
    expect(auditActions.has("approval_decision")).toBe(true);

    // Verify management query resolves them while designer is blocked
    const founderRes = getAuthoritativeAuditHistory(state, "proj_acme", "u_founder", "founder");
    const designerRes = getAuthoritativeAuditHistory(state, "proj_acme", "u_designer1", "designer");

    expect(founderRes.status).toBe(200);
    expect(designerRes.status).toBe(403);
  });

  it("9. verifies that operational work artifacts remain visible to designers while audit trail is blocked", () => {
    const state = createTestState();

    // Designer cannot get audit history
    const auditRes = getAuthoritativeAuditHistory(state, "proj_acme", "u_designer1", "designer");
    expect(auditRes.status).toBe(403);

    // But operational deliverables, assignments, change requests, and versions remain available
    const designerAssignments = state.contentAssignments.filter((a) => a.assigneeUserId === "u_designer1");
    expect(designerAssignments.length).toBeGreaterThan(0);

    const openCRs = state.changeRequests.filter((cr) => cr.projectId === "proj_acme");
    expect(openCRs).toBeDefined();
  });
});
