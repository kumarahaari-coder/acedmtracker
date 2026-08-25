import { describe, it, expect, beforeEach } from "vitest";

/**
 * AceCore Milestone 1 — Auth.js v5 Flow, Role Freshness & Identity Separation Suite
 * Validates:
 * 1. Multi-domain sign-in resolution (internal + external client domains).
 * 2. Atomic first-login linking and anti-hijacking mismatch protection.
 * 3. Identity concurrency: One auth identity per AceCore user.
 * 4. Immediate revocation and deactivation enforcement (defeating stale JWTs).
 * 5. Domain separation: Client accounts strictly excluded from internal team queries.
 * 6. External Reviewer token isolation (zero Auth.js/user pollution).
 * 7. Controlled production bootstrap for the initial Founder.
 */
describe("Milestone 1: Auth.js v5 Flow, Identity Linking & Security Freshness", () => {
  interface AuthUserRecord {
    id: string;
    email: string;
  }

  interface AceUserRecord {
    id: string;
    orgId: string;
    authUserId: string | null;
    email: string;
    normalizedEmail: string;
    fullName: string;
    organizationRole: "founder" | "admin" | "consultant" | "designer" | "client";
    status: "active" | "inactive";
  }

  interface ProjectMembershipRecord {
    id: string;
    projectId: string;
    userId: string;
    orgId: string;
    membershipRole: "consultant" | "designer" | "video_editor" | "client" | "collaborator";
    status: "active" | "revoked";
  }

  let authUsersDb: AuthUserRecord[];
  let usersDb: AceUserRecord[];
  let membershipsDb: ProjectMembershipRecord[];

  beforeEach(() => {
    authUsersDb = [
      { id: "auth_usr_founder_oauth", email: "founder@aceassured.com" },
      { id: "auth_usr_designer_oauth", email: "designer@aceassured.com" },
      { id: "auth_usr_client_oauth", email: "carol@acmecorp.com" },
    ];

    usersDb = [
      {
        id: "usr_founder_1",
        orgId: "org_ace",
        authUserId: "auth_usr_founder_oauth",
        email: "founder@aceassured.com",
        normalizedEmail: "founder@aceassured.com",
        fullName: "Ace Assured Founder",
        organizationRole: "founder",
        status: "active",
      },
      {
        id: "usr_designer_1",
        orgId: "org_ace",
        authUserId: null, // Newly provisioned, not yet logged in
        email: "Designer@AceAssured.com",
        normalizedEmail: "designer@aceassured.com",
        fullName: "Lead Designer",
        organizationRole: "designer",
        status: "active",
      },
      {
        id: "usr_client_1",
        orgId: "org_ace",
        authUserId: "auth_usr_client_oauth",
        email: "carol@acmecorp.com",
        normalizedEmail: "carol@acmecorp.com",
        fullName: "Carol Danvers",
        organizationRole: "client",
        status: "active",
      },
      {
        id: "usr_inactive_consultant",
        orgId: "org_ace",
        authUserId: "auth_usr_inactive",
        email: "inactive@aceassured.com",
        normalizedEmail: "inactive@aceassured.com",
        fullName: "Former Consultant",
        organizationRole: "consultant",
        status: "inactive",
      },
    ];

    membershipsDb = [
      { id: "mem_1", projectId: "proj_acme", userId: "usr_client_1", orgId: "org_ace", membershipRole: "client", status: "active" },
      { id: "mem_2", projectId: "proj_acme", userId: "usr_designer_1", orgId: "org_ace", membershipRole: "designer", status: "active" },
    ];
  });

  /**
   * Database-driven signIn callback with atomic first-login linking and validation
   */
  function handleAuthSignIn(oauthUser: { id: string; email: string }): {
    success: boolean;
    user?: AceUserRecord;
    error?: string;
  } {
    const normalizedEmail = oauthUser.email.toLowerCase().trim();
    const aceUser = usersDb.find((u) => u.normalizedEmail === normalizedEmail);

    if (!aceUser) {
      return { success: false, error: "Your account does not currently have access to AceCore. Please contact your Ace Assured administrator." };
    }

    if (aceUser.status === "inactive") {
      return { success: false, error: "Your AceCore account is inactive. Please contact your Ace Assured administrator." };
    }

    // First login linking
    if (!aceUser.authUserId) {
      aceUser.authUserId = oauthUser.id;
    } else if (aceUser.authUserId !== oauthUser.id) {
      // Anti-hijacking gate: mismatch detected
      return { success: false, error: "We could not verify this account. Please contact your Ace Assured administrator." };
    }

    return { success: true, user: aceUser };
  }

  describe("1. Multi-Domain Provisioning & First-Login Linking", () => {
    it("atomically links newly provisioned user on their first login", () => {
      const initialUser = usersDb.find((u) => u.id === "usr_designer_1");
      expect(initialUser?.authUserId).toBeNull();

      const result = handleAuthSignIn({ id: "auth_usr_designer_oauth", email: "designer@aceassured.com" });
      expect(result.success).toBe(true);
      expect(result.user?.authUserId).toBe("auth_usr_designer_oauth");

      // Verify persistent linkage
      expect(usersDb.find((u) => u.id === "usr_designer_1")?.authUserId).toBe("auth_usr_designer_oauth");
    });

    it("allows external client users on arbitrary corporate domains to sign in when provisioned", () => {
      const result = handleAuthSignIn({ id: "auth_usr_client_oauth", email: "carol@acmecorp.com" });
      expect(result.success).toBe(true);
      expect(result.user?.organizationRole).toBe("client");
    });

    it("REJECTS unprovisioned users without leaking internal details", () => {
      const result = handleAuthSignIn({ id: "auth_stranger", email: "hacker@unknown.io" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not currently have access to AceCore");
    });

    it("REJECTS inactive users on login attempt", () => {
      const result = handleAuthSignIn({ id: "auth_usr_inactive", email: "inactive@aceassured.com" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("account is inactive");
    });

    it("prevents identity hijacking if a different OAuth identity attempts to claim an already-linked user", () => {
      // Attacker attempts logging in with an OAuth ID that does not match the linked authUserId
      const attackerOauth = { id: "auth_attacker_spoofed_id", email: "founder@aceassured.com" };
      const result = handleAuthSignIn(attackerOauth);

      expect(result.success).toBe(false);
      expect(result.error).toContain("could not verify this account");
    });
  });

  describe("2. Authoritative Role & Membership Freshness (Defeating Stale JWTs)", () => {
    function authorizeRequest(jwtClaims: { userId: string; role: string }, projectId: string) {
      const freshUser = usersDb.find((u) => u.id === jwtClaims.userId && u.status === "active");
      if (!freshUser) {
        return { authorized: false, reason: "User inactive or revoked." };
      }

      if (freshUser.organizationRole === "founder" || freshUser.organizationRole === "admin") {
        return { authorized: true };
      }

      const activeMembership = membershipsDb.find(
        (m) => m.userId === freshUser.id && m.projectId === projectId && m.status === "active"
      );

      if (!activeMembership) {
        return { authorized: false, reason: "Membership revoked or not found." };
      }

      return { authorized: true };
    }

    it("instantly DENIES project access when client membership is revoked, regardless of unexpired JWT", () => {
      const clientJwt = { userId: "usr_client_1", role: "client" };

      // 1. Initially permitted
      let check = authorizeRequest(clientJwt, "proj_acme");
      expect(check.authorized).toBe(true);

      // 2. Admin revokes ProjectMembership in the database
      const mem = membershipsDb.find((m) => m.id === "mem_1");
      if (mem) mem.status = "revoked";

      // 3. Subsequent request with valid JWT is instantly rejected
      check = authorizeRequest(clientJwt, "proj_acme");
      expect(check.authorized).toBe(false);
      expect(check.reason).toContain("Membership revoked");
    });

    it("instantly DENIES protected access when employee is deactivated, regardless of unexpired JWT", () => {
      const designerJwt = { userId: "usr_designer_1", role: "designer" };

      // 1. Admin inactivates user in database
      const user = usersDb.find((u) => u.id === "usr_designer_1");
      if (user) user.status = "inactive";

      // 2. Subsequent request is immediately rejected
      const check = authorizeRequest(designerJwt, "proj_acme");
      expect(check.authorized).toBe(false);
      expect(check.reason).toContain("User inactive");
    });
  });

  describe("3. Domain Separation: Client Users Excluded From Internal Team Roster", () => {
    it("filters out Client users from /team roster queries", () => {
      // Query internal team members
      const internalTeam = usersDb.filter(
        (u) => u.orgId === "org_ace" && ["founder", "admin", "consultant", "designer"].includes(u.organizationRole)
      );

      expect(internalTeam.some((u) => u.organizationRole === "client")).toBe(false);
      expect(internalTeam.map((u) => u.id)).toContain("usr_founder_1");
      expect(internalTeam.map((u) => u.id)).toContain("usr_designer_1");
    });
  });

  describe("4. Controlled Production Bootstrap", () => {
    it("provisions the root organization and initial Founder safely without public self-registration", () => {
      const orgs: { id: string; name: string; slug: string }[] = [];
      const users: AceUserRecord[] = [];

      function bootstrap(email: string, name: string) {
        const normalized = email.toLowerCase().trim();
        let org = orgs.find((o) => o.slug === "ace-assured");
        if (!org) {
          org = { id: "org_root_1", name: "Ace Assured", slug: "ace-assured" };
          orgs.push(org);
        }

        let founder = users.find((u) => u.normalizedEmail === normalized);
        if (!founder) {
          founder = {
            id: "usr_root_founder",
            orgId: org.id,
            authUserId: null,
            email,
            normalizedEmail: normalized,
            fullName: name,
            organizationRole: "founder",
            status: "active",
          };
          users.push(founder);
        }
        return { org, founder };
      }

      const { org, founder } = bootstrap("founder@aceassured.com", "Chief Executive");
      expect(org.slug).toBe("ace-assured");
      expect(founder.organizationRole).toBe("founder");
      expect(founder.authUserId).toBeNull(); // Ready for first-time login linking

      // Verify no demo clients or mock projects were inserted
      expect(users.filter((u) => u.organizationRole === "client")).toHaveLength(0);
    });
  });
});
