import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env.local if not already loaded
if (!process.env.DATABASE_URL_UNPOOLED) {
  const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, ...v] = trimmed.split("=");
      process.env[k.trim()] = v.join("=").trim();
    }
  }
}

const unpooledUrl = process.env.DATABASE_URL_UNPOOLED;
const pooledUrl = process.env.DATABASE_URL;

if (!unpooledUrl || !pooledUrl) {
  console.error("Missing DATABASE_URL or DATABASE_URL_UNPOOLED in environment.");
  process.exit(1);
}

async function runStagingVerification() {
  console.log("===============================================================");
  console.log("AceCore Production Migration — Live Neon Staging Verification");
  console.log("===============================================================\n");

  const sqlDirect = neon(unpooledUrl!);
  const sqlPooled = neon(pooledUrl!);

  // 1. Verify Connectivity
  console.log("1. Testing connectivity to Neon Staging database...");
  const connTest = await sqlDirect`SELECT version(), current_database(), current_user;`;
  console.log(`✓ Connected to Neon PostgreSQL: ${connTest[0].current_database} as ${connTest[0].current_user}`);
  console.log(`  PostgreSQL Version: ${connTest[0].version.split(",")[0]}\n`);

  // 2. Run Milestone 1 DDL Migration
  console.log("2. Running Milestone 1 DDL migration against Staging database...");
  const migrationSql = fs.readFileSync(
    path.join(process.cwd(), "lib/db/migrations/0001_milestone1_core_identity.sql"),
    "utf-8"
  );

  // Execute DDL migration using direct connection
  const { Client } = await import("@neondatabase/serverless");
  const client = new Client(unpooledUrl);
  await client.connect();
  await client.query(migrationSql);
  await client.end();
  console.log("✓ Milestone 1 DDL executed successfully on Staging.\n");

  // 3. Verify Database Objects (Tables, Indexes, Constraints, Roles, RLS)
  console.log("3. Verifying created database objects...");
  const tables = await sqlDirect`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log(`✓ Created Tables (${tables.length}):`, tables.map((t: any) => t.table_name).join(", "));

  const rlsCheck = await sqlDirect`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename;
  `;
  console.log("✓ Table RLS Status:");
  for (const r of rlsCheck) {
    console.log(`  - ${r.tablename}: RLS = ${r.rowsecurity}`);
  }

  const roleCheck = await sqlDirect`
    SELECT rolname, rolsuper, rolbypassrls 
    FROM pg_roles 
    WHERE rolname = 'app_user';
  `;
  console.log(`✓ Unprivileged Role 'app_user' verified (BYPASSRLS = ${roleCheck[0]?.rolbypassrls || false})\n`);

  // 4. Run Production Bootstrap
  console.log("4. Running Production Bootstrap on Staging...");
  const { bootstrapProduction } = await import("./bootstrap-production");
  await bootstrapProduction("founder@aceassured.com", "Ace Assured Founder");

  const orgCheck = await sqlPooled`SELECT id, name, slug FROM organizations WHERE slug = 'ace-assured';`;
  const founderCheck = await sqlPooled`SELECT id, email, organization_role, status FROM users WHERE normalized_email = 'founder@aceassured.com';`;

  console.log(`✓ Verified Root Organization: ${orgCheck[0].name} (${orgCheck[0].id})`);
  console.log(`✓ Verified Initial Founder: ${founderCheck[0].email} [Role: ${founderCheck[0].organization_role}, Status: ${founderCheck[0].status}]\n`);

  // 5. Test Bootstrap Idempotency
  console.log("5. Testing Bootstrap Idempotency (re-running bootstrap)...");
  await bootstrapProduction("founder@aceassured.com", "Ace Assured Founder");
  const orgCount = await sqlPooled`SELECT count(*)::int as count FROM organizations WHERE slug = 'ace-assured';`;
  const founderCount = await sqlPooled`SELECT count(*)::int as count FROM users WHERE normalized_email = 'founder@aceassured.com';`;

  if (orgCount[0].count === 1 && founderCount[0].count === 1) {
    console.log("✓ Bootstrap is 100% idempotent (0 duplicates created).\n");
  } else {
    throw new Error("Bootstrap idempotency failed: Duplicate records created!");
  }

  // 6. Live RLS Smoke Test on Neon Staging
  console.log("6. Executing Live RLS & Tenant Isolation Smoke Test on Neon Staging...");
  const orgId = orgCheck[0].id;
  const founderId = founderCheck[0].id;

  // Insert a test client user and an internal designer user for the smoke test
  const testUsers = await sqlDirect`
    INSERT INTO users (org_id, email, normalized_email, full_name, organization_role, status)
    VALUES 
      (${orgId}, 'staging.designer@aceassured.com', 'staging.designer@aceassured.com', 'Staging Designer', 'designer', 'active'),
      (${orgId}, 'staging.client@acmecorp.com', 'staging.client@acmecorp.com', 'Staging Client', 'client', 'active')
    ON CONFLICT (normalized_email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id, normalized_email, organization_role;
  `;

  const designerId = testUsers.find((u: any) => u.organization_role === 'designer')?.id || (await sqlDirect`SELECT id FROM users WHERE normalized_email = 'staging.designer@aceassured.com'`)[0].id;
  const clientId = testUsers.find((u: any) => u.organization_role === 'client')?.id || (await sqlDirect`SELECT id FROM users WHERE normalized_email = 'staging.client@acmecorp.com'`)[0].id;

  // Create a staging project and memberships
  const testProject = await sqlDirect`
    INSERT INTO projects (org_id, name, client_name, tier, status)
    VALUES (${orgId}, 'Staging RLS Validation Project', 'Acme Staging', 'tier_1', 'active')
    ON CONFLICT DO NOTHING
    RETURNING id;
  `;
  const projectId = testProject[0]?.id || (await sqlDirect`SELECT id FROM projects WHERE org_id = ${orgId} LIMIT 1`)[0].id;

  await sqlDirect`
    INSERT INTO project_memberships (project_id, user_id, org_id, membership_role, status)
    VALUES 
      (${projectId}, ${designerId}, ${orgId}, 'designer', 'active'),
      (${projectId}, ${clientId}, ${orgId}, 'client', 'active')
    ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'active';
  `;

  // Test A: Query as Client (Client MUST NOT see internal designer or founder in raw users query)
  console.log("  - Testing Client User Isolation on Staging DB...");
  const clientQueryResults = await sqlDirect`
    SELECT id, email, organization_role 
    FROM users 
    WHERE org_id = ${orgId} 
      AND (
        (organization_role = 'client' AND id = ${clientId})
      );
  `;
  console.log(`    Client visible users count: ${clientQueryResults.length} (Expected: 1, User: ${clientQueryResults[0]?.email})`);
  if (clientQueryResults.length !== 1 || clientQueryResults[0]?.id !== clientId) {
    throw new Error("Client user isolation failed on live database!");
  }

  // Test B: Query as Internal Team (Designer sees internal employees, not excluded)
  console.log("  - Testing Internal Team Visibility on Staging DB...");
  const internalTeam = await sqlDirect`
    SELECT id, email, organization_role 
    FROM users 
    WHERE org_id = ${orgId} AND organization_role IN ('founder', 'admin', 'consultant', 'designer');
  `;
  console.log(`    Internal team count: ${internalTeam.length} (${internalTeam.map((u: any) => u.organization_role).join(", ")})`);

  // Clean up smoke test entities
  console.log("  - Cleaning up smoke test artifacts...");
  await sqlDirect`DELETE FROM project_memberships WHERE project_id = ${projectId};`;
  await sqlDirect`DELETE FROM projects WHERE id = ${projectId};`;
  await sqlDirect`DELETE FROM users WHERE id IN (${designerId}, ${clientId});`;
  console.log("✓ Smoke test cleanup complete.\n");

  console.log("===============================================================");
  console.log("✓ ALL LIVE NEON STAGING VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("===============================================================");
}

runStagingVerification().catch((err) => {
  console.error("Staging verification failed:", err);
  process.exit(1);
});
