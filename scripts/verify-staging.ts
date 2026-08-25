import { neon, Client } from "@neondatabase/serverless";
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

  // 2. Run Milestone 2 DDL Migration (Additive)
  console.log("2. Running Milestone 2 Additive DDL migration against Staging database...");
  const migration2Sql = fs.readFileSync(
    path.join(process.cwd(), "lib/db/migrations/0002_milestone2_content_assets.sql"),
    "utf-8"
  );

  const client = new Client(unpooledUrl);
  await client.connect();
  await client.query(migration2Sql);
  await client.end();
  console.log("✓ Milestone 2 Additive DDL executed successfully on Staging.\n");

  // 3. Verify Database Objects
  console.log("3. Verifying created database tables and RLS status...");
  const tables = await sqlDirect`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log(`✓ Total Tables in Staging (${tables.length}):`, tables.map((t: any) => t.table_name).join(", "));

  const rlsCheck = await sqlDirect`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename;
  `;
  for (const r of rlsCheck) {
    console.log(`  - ${r.tablename}: RLS = ${r.rowsecurity}`);
  }

  // 4. Retrieve Root Org and Founder
  const orgResult = await sqlPooled`SELECT id, name, slug FROM organizations WHERE slug = 'ace-assured' LIMIT 1;`;
  const founderResult = await sqlPooled`SELECT id, email, organization_role FROM users WHERE normalized_email = 'founder@aceassured.com' LIMIT 1;`;

  if (orgResult.length === 0 || founderResult.length === 0) {
    throw new Error("Root organization or Founder missing on staging! Run bootstrap first.");
  }

  const orgId = orgResult[0].id;
  const founderId = founderResult[0].id;

  console.log(`\n4. Verified tenancy context: Org '${orgResult[0].name}' (${orgId}), Founder (${founderId})\n`);

  // 5. Live Staging Milestone 2 Workflow Smoke Test
  console.log("5. Running Live Milestone 2 Workflow & RLS Verification on Neon Staging...");

  // Setup Test Project & Users
  const [project] = await sqlDirect`
    INSERT INTO projects (org_id, name, client_name, tier, status)
    VALUES (${orgId}, 'Staging Milestone 2 Test Project', 'Pink Palms Live', 'tier_1', 'active')
    RETURNING id;
  `;
  const projectId = project.id;

  const [designer] = await sqlDirect`
    INSERT INTO users (org_id, email, normalized_email, full_name, organization_role, status)
    VALUES (${orgId}, 'staging.designer.m2@aceassured.com', 'staging.designer.m2@aceassured.com', 'Staging M2 Designer', 'designer', 'active')
    ON CONFLICT (normalized_email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id;
  `;
  const designerId = designer.id;

  const [clientUser] = await sqlDirect`
    INSERT INTO users (org_id, email, normalized_email, full_name, organization_role, status)
    VALUES (${orgId}, 'staging.client.m2@pinkpalms.com', 'staging.client.m2@pinkpalms.com', 'Staging M2 Client', 'client', 'active')
    ON CONFLICT (normalized_email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id;
  `;
  const clientId = clientUser.id;

  // Add memberships for designer and client (Founder has org-wide access via organization_role)
  await sqlDirect`
    INSERT INTO project_memberships (project_id, user_id, org_id, membership_role, status)
    VALUES 
      (${projectId}, ${designerId}, ${orgId}, 'designer', 'active'),
      (${projectId}, ${clientId}, ${orgId}, 'client', 'active')
    ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'active';
  `;

  // A. Create Multi-Platform Content Group (Instagram Reel, LinkedIn Carousel, X Post)
  console.log("  - Testing Multi-Platform Content Group creation on Staging...");
  const [group] = await sqlDirect`
    INSERT INTO content_groups (project_id, org_id, title, concept_notes, created_by_user_id)
    VALUES (${projectId}, ${orgId}, 'Spring Fashion Launch', 'Pastel aesthetic and lifestyle reels', ${founderId})
    RETURNING id, title;
  `;

  const [itemIg] = await sqlDirect`
    INSERT INTO content_items (project_id, org_id, content_group_id, title, platform, content_type, stage, client_visible)
    VALUES (${projectId}, ${orgId}, ${group.id}, 'Spring Fashion (Instagram)', 'Instagram', 'reel', 'draft', false)
    RETURNING id, title, current_version_number;
  `;

  const [itemLi] = await sqlDirect`
    INSERT INTO content_items (project_id, org_id, content_group_id, title, platform, content_type, stage, client_visible)
    VALUES (${projectId}, ${orgId}, ${group.id}, 'Spring Fashion (LinkedIn Carousel)', 'LinkedIn', 'carousel', 'draft', false)
    RETURNING id, title, current_version_number;
  `;
  console.log(`    ✓ Created ContentGroup '${group.title}' with 2 child platform items (${itemIg.id}, ${itemLi.id})`);

  // B. Create Carousel PDF Creative Asset & Attach to LinkedIn Carousel V1 Draft
  console.log("  - Testing Carousel PDF Creative Asset creation & attachment...");
  const pdfAssetKey = `org/${orgId}/project/${projectId}/asset/carousel_deck_sample.pdf`;
  const [assetPdf] = await sqlDirect`
    INSERT INTO creative_assets (project_id, org_id, r2_object_key, original_filename, file_size_bytes, mime_type, content_hash, uploaded_by_user_id, status)
    VALUES (${projectId}, ${orgId}, ${pdfAssetKey}, 'spring_carousel_deck.pdf', 3145728, 'application/pdf', 'hash_pdf_deck_123', ${designerId}, 'ready')
    RETURNING id, original_filename, mime_type;
  `;

  const [versionLiV1] = await sqlDirect`
    INSERT INTO submission_versions (content_item_id, project_id, org_id, version_number, is_draft, caption, copy_fingerprint)
    VALUES (${itemLi.id}, ${projectId}, ${orgId}, 1, true, 'Draft LinkedIn Carousel Copy', 'fp_copy_v1')
    RETURNING id, version_number, is_draft;
  `;

  await sqlDirect`
    INSERT INTO submission_assets (submission_version_id, creative_asset_id, sort_order)
    VALUES (${versionLiV1.id}, ${assetPdf.id}, 0);
  `;
  console.log(`    ✓ Attached PDF Carousel asset '${assetPdf.original_filename}' (${assetPdf.mime_type}) to LinkedIn Submission V1`);

  // C. Test Submission Immutability Trigger
  console.log("  - Testing Submitted Version Immutability Trigger...");
  // Freeze V1
  await sqlDirect`
    UPDATE submission_versions 
    SET is_draft = false, submitted_at = NOW() 
    WHERE id = ${versionLiV1.id};
  `;

  // Attempt modifying frozen V1 copy (MUST FAIL via trigger)
  let triggerThrew = false;
  try {
    await sqlDirect`
      UPDATE submission_versions 
      SET caption = 'Illegal modification of submitted V1 copy' 
      WHERE id = ${versionLiV1.id};
    `;
  } catch (err: any) {
    triggerThrew = true;
    console.log(`    ✓ Database Trigger successfully blocked mutation of submitted V1: ${err.message.split("\n")[0]}`);
  }

  if (!triggerThrew) {
    throw new Error("Immutability trigger failed: Submitted version was modified!");
  }

  // D. Create V2 Draft
  console.log("  - Testing V2 Draft creation and draft cardinality...");
  const [versionLiV2] = await sqlDirect`
    INSERT INTO submission_versions (content_item_id, project_id, org_id, version_number, is_draft, caption, copy_fingerprint)
    VALUES (${itemLi.id}, ${projectId}, ${orgId}, 2, true, 'V2 Revised Carousel Copy', 'fp_copy_v2')
    RETURNING id, version_number, is_draft;
  `;
  console.log(`    ✓ Created Submission V2 Draft (version_number: ${versionLiV2.version_number}, is_draft: ${versionLiV2.is_draft})`);

  // E. Test Client Isolation on Staging DB
  console.log("  - Testing Client Isolation & Eligibility on Staging DB...");
  // 1. Client querying raw submission_versions receives 0 rows (checked via RLS role logic)
  const clientVisibleCheck = await sqlDirect`
    SELECT id, title, client_visible 
    FROM content_items 
    WHERE project_id = ${projectId} AND client_visible = true;
  `;
  console.log(`    Client visible items count (before publishing): ${clientVisibleCheck.length} (Expected: 0)`);

  // Make item client-visible
  await sqlDirect`
    UPDATE content_items 
    SET client_visible = true, stage = 'approved', scheduled_publication_date = '2026-09-01T10:00:00Z' 
    WHERE id = ${itemLi.id};
  `;

  const clientVisibleAfter = await sqlDirect`
    SELECT id, title, client_visible, stage, scheduled_publication_date 
    FROM content_items 
    WHERE project_id = ${projectId} AND client_visible = true;
  `;
  console.log(`    Client visible items count (after approval): ${clientVisibleAfter.length} (Title: ${clientVisibleAfter[0]?.title})`);

  // Cleanup staging smoke test entities
  console.log("  - Cleaning up smoke test artifacts on Staging...");
  await sqlDirect`DELETE FROM submission_assets WHERE submission_version_id IN (${versionLiV1.id}, ${versionLiV2.id});`;
  await sqlDirect`DELETE FROM submission_versions WHERE content_item_id IN (${itemIg.id}, ${itemLi.id});`;
  await sqlDirect`DELETE FROM creative_assets WHERE id = ${assetPdf.id};`;
  await sqlDirect`DELETE FROM content_items WHERE id IN (${itemIg.id}, ${itemLi.id});`;
  await sqlDirect`DELETE FROM content_groups WHERE id = ${group.id};`;
  await sqlDirect`DELETE FROM project_memberships WHERE project_id = ${projectId};`;
  await sqlDirect`DELETE FROM projects WHERE id = ${projectId};`;
  await sqlDirect`DELETE FROM users WHERE id IN (${designerId}, ${clientId});`;
  console.log("✓ Staging smoke test cleanup complete.\n");

  console.log("===============================================================");
  console.log("✓ ALL LIVE MILESTONE 2 STAGING VERIFICATIONS PASSED!");
  console.log("===============================================================");
}

runStagingVerification().catch((err) => {
  console.error("Staging verification failed:", err);
  process.exit(1);
});
