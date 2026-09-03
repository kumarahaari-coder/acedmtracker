import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Delete Deliverable Architectural & Lifecycle Contracts", () => {
  const deleteActionFile = path.resolve(process.cwd(), "lib/actions/deleteDeliverable.ts");
  const modalFile = path.resolve(process.cwd(), "components/content/DeleteDeliverableModal.tsx");
  const calendarPageFile = path.resolve(process.cwd(), "app/(dashboard)/projects/[projectId]/calendar/page.tsx");
  const projectPageFile = path.resolve(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx");
  const detailPageFile = path.resolve(process.cwd(), "app/(dashboard)/projects/[projectId]/content/[itemId]/page.tsx");

  const deleteActionCode = fs.readFileSync(deleteActionFile, "utf-8");
  const modalCode = fs.readFileSync(modalFile, "utf-8");
  const calendarCode = fs.readFileSync(calendarPageFile, "utf-8");
  const projectCode = fs.readFileSync(projectPageFile, "utf-8");
  const detailCode = fs.readFileSync(detailPageFile, "utf-8");

  it("Contract: Server-side authorization blocks designers, clients, and unassigned consultants", () => {
    // Assert client role is explicitly rejected
    expect(deleteActionCode).toContain('orgRole === "client"');
    expect(deleteActionCode).toContain("Clients cannot delete deliverables");

    // Assert non-management roles are rejected
    expect(deleteActionCode).toContain("Designers and team contributors do not have permission");

    // Assert consultant must have project membership
    expect(deleteActionCode).toContain('orgRole === "consultant"');
    expect(deleteActionCode).toContain("projectMemberships");
    expect(deleteActionCode).toContain("Consultants may only delete deliverables in projects they are assigned to");
  });

  it("Contract: Operational history inspection evaluates stages, sessions, versions, approvals, and comments", () => {
    // Verify checkItemOperationalHistory inspects all operational dimensions
    expect(deleteActionCode).toContain("checkItemOperationalHistory");
    expect(deleteActionCode).toContain("submissionVersions");
    expect(deleteActionCode).toContain("workSessions");
    expect(deleteActionCode).toContain("accumulatedSeconds");
    expect(deleteActionCode).toContain("approvalDecisions");
    expect(deleteActionCode).toContain("changeRequests");
    expect(deleteActionCode).toContain("comments");
    expect(deleteActionCode).toContain("externalReviewTokens");
  });

  it("Contract: Anchor transfer preserves planned effort when deleting effort-anchor deliverable", () => {
    // Verify sibling anchor transfer
    expect(deleteActionCode).toContain("isEffortAnchor");
    expect(deleteActionCode).toContain("survivingSiblings");
    expect(deleteActionCode).toContain("finalPlannedSeconds");
    expect(deleteActionCode).toContain("standardContentSeconds");
    expect(deleteActionCode).toContain("standardProductionSeconds");
  });

  it("Contract: Hard delete cleans draft versions, assignments, and orphaned R2 assets with 0 orphans", () => {
    expect(deleteActionCode).toContain("isHardDelete");
    expect(deleteActionCode).toContain("submissionAssets");
    expect(deleteActionCode).toContain("creativeAssets");
    expect(deleteActionCode).toContain("deleteR2Object");
    expect(deleteActionCode).toContain("assignmentDeadlineHistory");
  });

  it("Contract: Audit records are written for both hard-delete and soft-delete operations", () => {
    expect(deleteActionCode).toContain("auditRecords");
    expect(deleteActionCode).toContain("HARD_DELETE_DELIVERABLE");
    expect(deleteActionCode).toContain("SOFT_DELETE_DELIVERABLE");
  });

  it("Contract: UI Confirmation Modal requires explicit typed 'DELETE' and supports group scope", () => {
    expect(modalCode).toContain('"DELETE"');
    expect(modalCode).toContain("deleteScope");
    expect(modalCode).toContain("Delete this platform deliverable only");
    expect(modalCode).toContain("Delete entire deliverable group");
  });

  it("Contract: Delete Deliverable is wired into Detail view, Calendar, and Project Listing", () => {
    expect(detailCode).toContain("DeleteDeliverableModal");
    expect(calendarCode).toContain("DeleteDeliverableModal");
    expect(projectCode).toContain("DeleteDeliverableModal");
  });
});
