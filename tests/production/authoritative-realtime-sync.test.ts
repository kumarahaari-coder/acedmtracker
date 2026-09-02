import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { assertNonProductionEnvironment } from "@/lib/guards/environment-safety";

import { addClientToProjectAction, removeClientFromProjectAction } from "@/lib/actions/clients";
import { createTeamMemberAction } from "@/lib/actions/team";
import { createProjectAction, addProjectMemberAction, removeProjectMemberAction } from "@/lib/actions/projects";

describe("Production Authoritative Synchronization & Provisioning Architecture", () => {
  beforeAll(() => {
    assertNonProductionEnvironment("Authoritative realtime sync test");
  });

  const orgId = "7af122b1-9de9-4f26-bab3-4a7537eecdf7";

  it("provisions a new Team Member in PostgreSQL with immediate login eligibility", async () => {
    const designerEmail = `designer_${Date.now()}@aceassured.com`;
    const res = await createTeamMemberAction({
      fullName: "Maya Designer",
      email: designerEmail,
      role: "designer",
    });

    expect(res.success).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.email).toBe(designerEmail);
    expect(res.user?.organizationRole).toBe("designer");
    expect(res.user?.status).toBe("active");
  });

  it("provisions a new Client from Project Settings and creates active project membership", async () => {
    // 1. Create a project
    const projRes = await createProjectAction({
      name: "Acme Omnichannel",
      clientBrand: "Acme Global",
    });
    expect(projRes.success).toBe(true);
    const projectId = projRes.project!.id;

    // 2. Add client to project
    const clientEmail = `client_${Date.now()}@acmeglobal.com`;
    const clientRes = await addClientToProjectAction({
      name: "John Client",
      email: clientEmail,
      jobTitle: "VP Marketing",
      projectId,
    });

    expect(clientRes.success).toBe(true);
    expect(clientRes.user).toBeDefined();
    expect(clientRes.user?.email).toBe(clientEmail);
    expect(clientRes.user?.organizationRole).toBe("client");
    expect(clientRes.user?.status).toBe("active");
    expect(clientRes.membership).toBeDefined();
    expect(clientRes.membership?.status).toBe("active");
    expect(clientRes.membership?.membershipRole).toBe("client");
  });

  it("handles duplicate Client addition gracefully and idempotently", async () => {
    const projRes = await createProjectAction({
      name: "Duplicate Test Project",
      clientBrand: "Duplicate Brand",
    });
    const projectId = projRes.project!.id;
    const clientEmail = `client_dup_${Date.now()}@brand.com`;

    const res1 = await addClientToProjectAction({
      name: "Alice Client",
      email: clientEmail,
      projectId,
    });
    expect(res1.success).toBe(true);

    // Second call with same email
    const res2 = await addClientToProjectAction({
      name: "Alice Client",
      email: clientEmail,
      projectId,
    });
    expect(res2.success).toBe(true);
    expect(res2.user?.id).toBe(res1.user?.id);
    expect(res2.membership?.status).toBe("active");
  });

  it("immediately denies access when Client membership is revoked", async () => {
    const projRes = await createProjectAction({
      name: "Revocation Test Project",
      clientBrand: "Revoke Brand",
    });
    const projectId = projRes.project!.id;
    const clientEmail = `client_revoke_${Date.now()}@brand.com`;

    const clientRes = await addClientToProjectAction({
      name: "Revocable Client",
      email: clientEmail,
      projectId,
    });
    expect(clientRes.success).toBe(true);
    const clientUserId = clientRes.user!.id;

    // Revoke access
    const revokeRes = await removeClientFromProjectAction({
      projectId,
      userId: clientUserId,
    });
    expect(revokeRes.success).toBe(true);
  });

  it("rejects attempts to add an internal employee as a client", async () => {
    const employeeEmail = `employee_${Date.now()}@aceassured.com`;
    await createTeamMemberAction({
      fullName: "Internal Staff",
      email: employeeEmail,
      role: "designer",
    });

    const projRes = await createProjectAction({
      name: "Staff Conflict Test",
      clientBrand: "Conflict Brand",
    });

    const clientRes = await addClientToProjectAction({
      name: "Internal Staff",
      email: employeeEmail,
      projectId: projRes.project!.id,
    });

    expect(clientRes.success).toBe(false);
    expect(clientRes.error).toContain("already an internal team member");
  });
});
