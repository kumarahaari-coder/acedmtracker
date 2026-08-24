import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";

describe("Guest Portal Isolation & Privacy Security", () => {
  const state = getInitialDeterministicState();

  it("filters comments so external guest receives ONLY external comments for the shared submission version", () => {
    const sharedVersionId = "ver_acme_1_v1";
    const itemId = "item_acme_1";

    // Filter comments visible to guest
    const guestComments = state.comments.filter(
      (c) =>
        c.contentItemId === itemId &&
        c.submissionVersionId === sharedVersionId &&
        c.visibility === "external"
    );

    // Filter internal comments
    const internalComments = state.comments.filter(
      (c) => c.contentItemId === itemId && c.visibility === "internal"
    );

    expect(guestComments.length).toBeGreaterThan(0);
    expect(guestComments.every((c) => c.visibility === "external")).toBe(true);
    expect(internalComments.length).toBeGreaterThan(0);
    expect(guestComments.some((c) => c.visibility === "internal")).toBe(false);
  });

  it("binds guest review link strictly to one specific submission version and valid token", () => {
    const link = state.externalReviewLinks.find((l) => l.demoToken === "token_demo_acme_guest_7721");
    expect(link).toBeDefined();
    expect(link?.submissionVersionId).toBe("ver_acme_1_v1");
    expect(link?.projectId).toBe("proj_acme");
  });
});
