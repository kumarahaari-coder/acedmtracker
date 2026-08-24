import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import { CURRENT_SCHEMA_VERSION } from "@/lib/migrations";

describe("LocalStorage Envelope & Deterministic Reset", () => {
  it("provides complete normalized deterministic baseline with 3 projects", () => {
    const fresh = getInitialDeterministicState();
    expect(fresh.projects.length).toBe(3);
    expect(fresh.users.length).toBe(6);
    expect(fresh.projectMemberships.length).toBeGreaterThan(5);
    expect(fresh.contentItems.length).toBeGreaterThan(4);
    expect(fresh.submissionVersions.length).toBeGreaterThan(4);
    expect(fresh.approvalDecisions.length).toBeGreaterThan(5);
    expect(fresh.changeRequests.length).toBeGreaterThan(1);
    expect(fresh.auditRecords.length).toBeGreaterThan(2);
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});
