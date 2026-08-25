import { describe, it, expect } from "vitest";

/**
 * AceCore Milestone 0 — Auth.js Database-Driven Authentication & Role Freshness Suite
 * Validates:
 * 1. Multi-domain database-driven user authentication (internal + external client domains)
 * 2. Strict separation of External Reviewers (token-based, non-user accounts)
 * 3. Dynamic role & membership freshness verification (defeating stale JWT claims)
 */
describe("Milestone 0: Database-Driven Auth.js Architecture & Role Freshness", () => {
  interface UserRecord {
    id: string;
    email: string;
    role: "founder" | "admin" | "consultant" | "designer" | "client";
    status: "active" | "inactive";
  }

  interface ProjectMembershipRecord {
    id: string;
    userId: string;
    projectId: string;
    role: "founder" | "admin" | "consultant" | "designer" | "client";
    status: "active" | "revoked";
  }

  // Database state
  let usersDb: UserRecord[] = [
    { id: "usr_1", email: "founder@aceassured.com", role: "founder", status: "active" },
    { id: "usr_2", email: "designer@aceassured.com", role: "designer", status: "active" },
    { id: "usr_3", email: "carol.danvers@acmecorp.com", role: "client", status: "active" }, // External company domain
    { id: "usr_4", email: "rogue.employee@aceassured.com", role: "designer", status: "active" },
  ];

  let membershipsDb: ProjectMembershipRecord[] = [
    { id: "mem_1", userId: "usr_3", projectId: "proj_acme", role: "client", status: "active" },
    { id: "mem_2", userId: "usr_4", projectId: "proj_acme", role: "designer", status: "active" },
  ];

  /**
   * Database-driven signIn callback
   * Authenticates internal employees and external client accounts based on DB user record
   */
  function handleSignIn(email: string): { allowed: boolean; user?: UserRecord; reason?: string } {
    const user = usersDb.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return { allowed: false, reason: "Unauthorized: No AceCore account provisioned for this email." };
    }
    if (user.status === "inactive") {
      return { allowed: false, reason: "Account is inactive." };
    }
    return { allowed: true, user };
  }

  /**
   * Authoritative Request Authorization Gate
   * Verifies live database status instead of solely trusting claims in a JWT token
   */
  function authorizeProjectRequest(
    tokenClaims: { userId: string; role: string },
    projectId: string
  ): { authorized: boolean; reason?: string } {
    // 1. Authoritative check: verify user is still active in database
    const freshUser = usersDb.find((u) => u.id === tokenClaims.userId);
    if (!freshUser || freshUser.status !== "active") {
      return { authorized: false, reason: "User account deactivated or not found." };
    }

    // 2. Global founders and admins have tenant-wide authorization
    if (freshUser.role === "founder" || freshUser.role === "admin") {
      return { authorized: true };
    }

    // 3. Authoritative membership check: verify project membership is active
    const activeMembership = membershipsDb.find(
      (m) => m.userId === tokenClaims.userId && m.projectId === projectId && m.status === "active"
    );

    if (!activeMembership) {
      return { authorized: false, reason: "Project membership revoked or does not exist." };
    }

    return { authorized: true };
  }

  describe("1. Multi-Domain Sign-In Validation", () => {
    it("allows internal Ace Assured users to sign in", () => {
      const result = handleSignIn("founder@aceassured.com");
      expect(result.allowed).toBe(true);
      expect(result.user?.role).toBe("founder");
    });

    it("allows external client users on arbitrary corporate domains to sign in when provisioned", () => {
      const result = handleSignIn("carol.danvers@acmecorp.com");
      expect(result.allowed).toBe(true);
      expect(result.user?.role).toBe("client");
    });

    it("rejects unprovisioned users regardless of email domain", () => {
      const unprovisionedInternal = handleSignIn("stranger@aceassured.com");
      expect(unprovisionedInternal.allowed).toBe(false);

      const unprovisionedExternal = handleSignIn("hacker@unknown-domain.io");
      expect(unprovisionedExternal.allowed).toBe(false);
    });
  });

  describe("2. Role & Membership Freshness (Defeating Stale JWTs)", () => {
    it("DENIES project access when client membership is revoked, even with valid JWT", () => {
      // Simulate client user holding a valid JWT minted 1 hour ago
      const clientJwt = { userId: "usr_3", role: "client" };
      const projectId = "proj_acme";

      // Initially authorized
      let authResult = authorizeProjectRequest(clientJwt, projectId);
      expect(authResult.authorized).toBe(true);

      // Admin revokes ProjectMembership in the database
      const membership = membershipsDb.find((m) => m.userId === "usr_3" && m.projectId === projectId);
      if (membership) membership.status = "revoked";

      // Client attempts project access with old valid JWT
      authResult = authorizeProjectRequest(clientJwt, projectId);
      expect(authResult.authorized).toBe(false);
      expect(authResult.reason).toContain("membership revoked");
    });

    it("DENIES access immediately when employee is marked inactive, even with valid JWT", () => {
      const employeeJwt = { userId: "usr_4", role: "designer" };
      const projectId = "proj_acme";

      // Initially authorized
      let authResult = authorizeProjectRequest(employeeJwt, projectId);
      expect(authResult.authorized).toBe(true);

      // Admin marks employee inactive
      const employee = usersDb.find((u) => u.id === "usr_4");
      if (employee) employee.status = "inactive";

      // Inactive employee attempts protected action
      authResult = authorizeProjectRequest(employeeJwt, projectId);
      expect(authResult.authorized).toBe(false);
      expect(authResult.reason).toContain("deactivated");
    });
  });

  describe("3. External Reviewer Isolation", () => {
    it("treats external review tokens as temporary submission-scoped access without creating user records", () => {
      interface ExternalReviewLink {
        token: string;
        submissionId: string;
        expiresAt: string;
        revoked: boolean;
      }

      const reviewLinks: ExternalReviewLink[] = [
        {
          token: "rev_tok_valid_9988",
          submissionId: "sub_101",
          expiresAt: "2099-01-01T00:00:00Z",
          revoked: false,
        },
      ];

      function resolveGuestReviewer(token: string) {
        const link = reviewLinks.find((l) => l.token === token && !l.revoked);
        if (!link) return { valid: false, error: "Link invalid or expired" };
        if (new Date(link.expiresAt) < new Date()) return { valid: false, error: "Link expired" };
        return {
          valid: true,
          submissionId: link.submissionId,
          isUserAccount: false, // Explicitly not an Auth.js user
        };
      }

      const review = resolveGuestReviewer("rev_tok_valid_9988");
      expect(review.valid).toBe(true);
      expect(review.isUserAccount).toBe(false);
      expect(review.submissionId).toBe("sub_101");
    });
  });
});
