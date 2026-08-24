import { describe, it, expect } from "vitest";
import { getRoleCapabilities } from "@/lib/context/RoleContext";

describe("Granular Role Capabilities & Field-Level Access", () => {
  it("prohibits Designer from managing analytics or viewing commercial metrics", () => {
    const designerCaps = getRoleCapabilities("designer");
    const clientCaps = getRoleCapabilities("client");

    expect(designerCaps.canManageAnalytics).toBe(false);
    expect(designerCaps.canViewCommercialMetrics).toBe(false);
    expect(clientCaps.canViewCommercialMetrics).toBe(false);
  });

  it("permits Admin, Founder, and Consultant to manage analytics and view commercial metrics", () => {
    const adminCaps = getRoleCapabilities("admin");
    const founderCaps = getRoleCapabilities("founder");
    const consultantCaps = getRoleCapabilities("consultant");

    expect(adminCaps.canManageAnalytics).toBe(true);
    expect(adminCaps.canViewCommercialMetrics).toBe(true);

    expect(founderCaps.canManageAnalytics).toBe(true);
    expect(founderCaps.canViewCommercialMetrics).toBe(true);

    expect(consultantCaps.canManageAnalytics).toBe(true);
    expect(consultantCaps.canViewCommercialMetrics).toBe(true);
  });
});
