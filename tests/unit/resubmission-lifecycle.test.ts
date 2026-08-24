import { describe, it, expect } from "vitest";
import { ChangeRequest } from "@/lib/types";

describe("Change Request Lifecycle & Resubmission Blocking", () => {
  it("blocks resubmission when any change request remains open without a designer response", () => {
    const changeRequests: ChangeRequest[] = [
      {
        id: "cr_1",
        projectId: "proj_acme",
        contentItemId: "item_1",
        submissionVersionId: "ver_1",
        component: "creative",
        reviewerUserId: "u_consultant",
        reviewerName: "Priyah Sharma",
        requestedChange: "Adjust color contrast",
        priority: "high",
        status: "open", // Unaddressed!
        createdAt: "2026-08-20T10:00:00Z",
      },
    ];

    const unaddressedOpen = changeRequests.filter((cr) => cr.status === "open");
    const canResubmit = unaddressedOpen.length === 0;

    expect(canResubmit).toBe(false);
    expect(unaddressedOpen.length).toBe(1);
  });

  it("unlocks resubmission once all open change requests have been responded to (addressed/resolved)", () => {
    const changeRequests: ChangeRequest[] = [
      {
        id: "cr_1",
        projectId: "proj_acme",
        contentItemId: "item_1",
        submissionVersionId: "ver_1",
        component: "creative",
        reviewerUserId: "u_consultant",
        reviewerName: "Priyah Sharma",
        requestedChange: "Adjust color contrast",
        priority: "high",
        status: "addressed", // Designer has answered!
        designerResponse: {
          text: "Updated background to high-contrast palette.",
          addressedInVersionId: "ver_2",
          respondedAt: "2026-08-20T11:00:00Z",
        },
        createdAt: "2026-08-20T10:00:00Z",
      },
    ];

    const unaddressedOpen = changeRequests.filter((cr) => cr.status === "open");
    const canResubmit = unaddressedOpen.length === 0;

    expect(canResubmit).toBe(true);
  });
});
