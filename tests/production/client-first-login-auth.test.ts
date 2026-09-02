import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { assertNonProductionEnvironment } from "@/lib/guards/environment-safety";

import { db } from "@/lib/db";
import { users, projectMemberships, projects, authUsers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { addClientToProjectAction } from "@/lib/actions/clients";
import { createTeamMemberAction, permanentlyDeleteTeamMemberAction } from "@/lib/actions/team";
import { createProjectAction } from "@/lib/actions/projects";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { authAccounts, authSessions, authVerificationTokens } from "@/lib/db/schema/auth";

describe("Production Client & Team Member First-Login Authentication Architecture", () => {
  let founderId: string;
  let testProjectId: string;
  const cleanupUserIds: string[] = [];

  const adapter = DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  });

  beforeAll(async () => {
    assertNonProductionEnvironment("Client first login integration test");

    // 1. Resolve or provision founder
    const [founder] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);

    if (founder) {
      founderId = founder.id;
    } else {
      const created = await createTeamMemberAction({
        fullName: "Staging Test Founder",
        email: `staging_founder_${Date.now()}@aceassured.com`,
        role: "founder",
      });
      founderId = created.user!.id;
    }

    // 2. Resolve or provision project
    const [proj] = await db.select().from(projects).limit(1);
    if (proj) {
      testProjectId = proj.id;
    } else {
      const createdProj = await createProjectAction({
        name: "Staging Test Project",
        clientName: "Staging Client",
        actorUserId: founderId,
      });
      testProjectId = createdProj.project!.id;
    }
  });

  afterAll(async () => {
    for (const uid of cleanupUserIds) {
      await permanentlyDeleteTeamMemberAction({
        userId: uid,
        actorUserId: founderId,
        reason: "Automated test cleanup",
      });
    }
  });

  it("proves end-to-end first-login for a fresh Client account", async () => {
    const tempClientEmail = `test_client_probe_${Date.now()}@gmail.com`;

    // 1. Provision new client through Server Action
    const createRes = await addClientToProjectAction({
      name: "Probe Client",
      email: tempClientEmail,
      projectId: testProjectId,
    });

    expect(createRes.success).toBe(true);
    expect(createRes.user).toBeDefined();
    const tempUserId = createRes.user!.id;
    cleanupUserIds.push(tempUserId);

    // 2. Query DB immediately
    const [clientInDb] = await db.select().from(users).where(eq(users.id, tempUserId)).limit(1);
    expect(clientInDb).toBeDefined();
    expect(clientInDb.normalizedEmail).toBe(tempClientEmail.toLowerCase().trim());
    expect(clientInDb.organizationRole).toBe("client");
    expect(clientInDb.status).toBe("active");

    // 3. Simulate first Google login and Auth.js identity creation
    const authUser = await adapter.createUser!({
      name: "Probe Client",
      email: tempClientEmail,
      emailVerified: new Date(),
    });
    expect(authUser).toBeDefined();

    // 4. Link Auth.js account
    await adapter.linkAccount!({
      userId: authUser.id,
      type: "oauth",
      provider: "google",
      providerAccountId: `google_oauth_${Date.now()}`,
    });

    // 5. Query user by email using adapter
    const fetchedAuthUser = await adapter.getUserByEmail!(tempClientEmail);
    expect(fetchedAuthUser).toBeDefined();
    expect(fetchedAuthUser?.email).toBe(tempClientEmail);
  });

  it("proves first-login for an invited Team Member (Designer)", async () => {
    const designerEmail = `designer_firstlogin_${Date.now()}@aceassured.com`;

    // 1. Founder provisions team member
    const teamRes = await createTeamMemberAction({
      fullName: "Probe Designer",
      email: designerEmail,
      role: "designer",
    });

    expect(teamRes.success).toBe(true);
    expect(teamRes.user).toBeDefined();
    const designerId = teamRes.user!.id;
    cleanupUserIds.push(designerId);

    // 2. Query DB
    const [designerInDb] = await db.select().from(users).where(eq(users.id, designerId)).limit(1);
    expect(designerInDb).toBeDefined();
    expect(designerInDb.organizationRole).toBe("designer");
    expect(designerInDb.status).toBe("active");

    // 3. First Google SSO login
    const authUser = await adapter.createUser!({
      name: "Probe Designer",
      email: designerEmail,
      emailVerified: new Date(),
    });
    expect(authUser).toBeDefined();

    const fetchedAuthUser = await adapter.getUserByEmail!(designerEmail);
    expect(fetchedAuthUser).toBeDefined();
    expect(fetchedAuthUser?.email).toBe(designerEmail);
  });
});
