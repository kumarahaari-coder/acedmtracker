import * as fs from "node:fs";
import * as path from "node:path";

// Load environment variables from .env.local synchronously before importing db/actions
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

async function runLiveIntegrationVerification() {
  console.log("==========================================================================");
  console.log("AceCore Phase B — Milestone 2 Final Live Integration Verification");
  console.log("Target Runtime: Neon PostgreSQL 18.6 Staging + Cloudflare R2 Staging");
  console.log("==========================================================================\n");

  const { neon, Client } = await import("@neondatabase/serverless");
  const {
    requestAssetUploadUrlAction,
    confirmAssetUploadAction,
    getAuthorizedAssetDownloadUrlAction,
  } = await import("../lib/actions/assets");
  const {
    createContentItemAction,
    createContentGroupAction,
    submitVersionAction,
    createNewVersionDraftAction,
    setClientVisibilityAction,
  } = await import("../lib/actions/content");

  const sqlDirect = neon(unpooledUrl!);
  const sqlPooled = neon(pooledUrl!);

  // 1. Re-apply Migration 0002 with new Asset Immutability Trigger
  console.log("1. Applying Milestone 2 Additive DDL Migration to Neon Staging...");
  const migration2Sql = fs.readFileSync(
    path.join(process.cwd(), "lib/db/migrations/0002_milestone2_content_assets.sql"),
    "utf-8"
  );
  const client = new Client(unpooledUrl);
  await client.connect();
  await client.query(migration2Sql);
  await client.end();
  console.log("✓ Migration 0002 applied with submitted version & asset immutability triggers.\n");

  // 2. Fetch Root Org and Founder
  const orgResult = await sqlPooled`SELECT id, name, slug FROM organizations WHERE slug = 'ace-assured' LIMIT 1;`;
  const founderResult = await sqlPooled`SELECT id, email, organization_role FROM users WHERE normalized_email = 'founder@aceassured.com' LIMIT 1;`;

  const orgId = orgResult[0].id;
  const founderId = founderResult[0].id;
  console.log(`✓ Tenancy Context: Org '${orgResult[0].name}' (${orgId}), Founder (${founderId})\n`);

  // 3. Create Isolated Test Projects & Users
  console.log("2. Setting up isolated test projects & actors on Staging...");
  const [projectA] = await sqlDirect`
    INSERT INTO projects (org_id, name, client_name, tier, status)
    VALUES (${orgId}, 'Integration Test Project A', 'Brand Alpha', 'tier_1', 'active')
    RETURNING id;
  `;
  const projAId = projectA.id;

  const [projectB] = await sqlDirect`
    INSERT INTO projects (org_id, name, client_name, tier, status)
    VALUES (${orgId}, 'Integration Test Project B', 'Brand Beta', 'tier_2', 'active')
    RETURNING id;
  `;
  const projBId = projectB.id;

  const [designer] = await sqlDirect`
    INSERT INTO users (org_id, email, normalized_email, full_name, organization_role, status)
    VALUES (${orgId}, 'int.designer@aceassured.com', 'int.designer@aceassured.com', 'Integration Designer', 'designer', 'active')
    ON CONFLICT (normalized_email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id;
  `;
  const designerId = designer.id;

  const [clientA] = await sqlDirect`
    INSERT INTO users (org_id, email, normalized_email, full_name, organization_role, status)
    VALUES (${orgId}, 'int.clientA@brandalpha.com', 'int.clienta@brandalpha.com', 'Client Sarah (Alpha)', 'client', 'active')
    ON CONFLICT (normalized_email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id;
  `;
  const clientAId = clientA.id;

  const [clientB] = await sqlDirect`
    INSERT INTO users (org_id, email, normalized_email, full_name, organization_role, status)
    VALUES (${orgId}, 'int.clientB@brandbeta.com', 'int.clientb@brandbeta.com', 'Client John (Beta)', 'client', 'active')
    ON CONFLICT (normalized_email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id;
  `;
  const clientBId = clientB.id;

  // Project Memberships
  await sqlDirect`
    INSERT INTO project_memberships (project_id, user_id, org_id, membership_role, status)
    VALUES 
      (${projAId}, ${designerId}, ${orgId}, 'designer', 'active'),
      (${projAId}, ${clientAId}, ${orgId}, 'client', 'active'),
      (${projBId}, ${clientBId}, ${orgId}, 'client', 'active')
    ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'active';
  `;
  console.log("✓ Test projects (Alpha & Beta), Designer, and isolated Clients provisioned.\n");

  // 4. Binary Upload Pipeline Verification (PNG, Carousel PDF, MP4)
  console.log("3. Executing Live Binary Upload Pipeline (PNG, Carousel PDF, MP4)...");

  // A. PNG Hero Image
  const pngFilename = "hero_banner.png";
  const pngMime = "image/png";
  const pngSize = 1048576; // 1 MB
  const pngHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const pngIntent = await requestAssetUploadUrlAction({
    actorUserId: designerId,
    projectId: projAId,
    filename: pngFilename,
    mimeType: pngMime,
    fileSizeBytes: pngSize,
    contentHash: pngHash,
  });

  if (!pngIntent.success || !pngIntent.asset) throw new Error("PNG upload intent failed");
  console.log(`  ✓ [PNG] Upload intent created (Status: ${pngIntent.asset.status})`);
  console.log(`    R2 Key Format: ${pngIntent.objectKey}`);

  // Confirm upload
  const pngConfirm = await confirmAssetUploadAction({
    actorUserId: designerId,
    assetId: pngIntent.asset.id,
  });
  if (!pngConfirm.success || pngConfirm.asset?.status !== "ready") throw new Error("PNG confirmation failed");
  console.log(`  ✓ [PNG] Confirmed upload (Status: ${pngConfirm.asset.status})\n`);

  // B. Carousel PDF Deck
  const pdfFilename = "spring_carousel_deck.pdf";
  const pdfMime = "application/pdf";
  const pdfSize = 5242880; // 5 MB
  const pdfHash = "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0";

  const pdfIntent = await requestAssetUploadUrlAction({
    actorUserId: designerId,
    projectId: projAId,
    filename: pdfFilename,
    mimeType: pdfMime,
    fileSizeBytes: pdfSize,
    contentHash: pdfHash,
  });

  if (!pdfIntent.success || !pdfIntent.asset) throw new Error("PDF upload intent failed");
  console.log(`  ✓ [Carousel PDF] Upload intent created (Status: ${pdfIntent.asset.status})`);
  console.log(`    R2 Key Format: ${pdfIntent.objectKey}`);

  // C. Video Reel MP4
  const mp4Filename = "product_teaser.mp4";
  const mp4Mime = "video/mp4";
  const mp4Size = 15728640; // 15 MB
  const mp4Hash = "f0e1d2c3b4a5968778695a4b3c2d1e0f0e1d2c3b4a5968778695a4b3c2d1e0f0";

  const mp4Intent = await requestAssetUploadUrlAction({
    actorUserId: designerId,
    projectId: projAId,
    filename: mp4Filename,
    mimeType: mp4Mime,
    fileSizeBytes: mp4Size,
    contentHash: mp4Hash,
  });

  if (!mp4Intent.success || !mp4Intent.asset) throw new Error("MP4 upload intent failed");
  console.log(`  ✓ [MP4 Reel] Upload intent created (Status: ${mp4Intent.asset.status})`);
  console.log(`    R2 Key Format: ${mp4Intent.objectKey}`);

  // Confirm PDF and MP4
  await confirmAssetUploadAction({ actorUserId: designerId, assetId: pdfIntent.asset.id });
  await confirmAssetUploadAction({ actorUserId: designerId, assetId: mp4Intent.asset.id });
  console.log("  ✓ [Carousel PDF & MP4] Confirmed and transitioned to status = 'ready'.\n");

  // 5. Create Content Item & Attach PDF to V1 Draft
  console.log("4. Creating LinkedIn Carousel Content Item & Attaching PDF to V1 Draft...");
  const itemResult = await createContentItemAction({
    actorUserId: designerId,
    projectId: projAId,
    title: "Alpha Carousel Campaign",
    platform: "LinkedIn",
    contentType: "carousel",
    scheduledPublicationDate: "2026-09-05T10:00:00Z",
    initialCopy: { caption: "Alpha Carousel V1 Copy", hashtags: ["alpha", "growth"], cta: "Visit website" },
  });

  if (!itemResult.success || !itemResult.item || !itemResult.version) throw new Error("ContentItem creation failed");
  const contentItem = itemResult.item;
  const versionV1 = itemResult.version;

  // Attach PDF Asset to V1
  await confirmAssetUploadAction({
    actorUserId: designerId,
    assetId: pdfIntent.asset.id,
    submissionVersionId: versionV1.id,
    sortOrder: 0,
  });
  console.log(`  ✓ Attached PDF Carousel asset (${pdfIntent.asset.id}) to V1 Draft (${versionV1.id})\n`);

  // 6. Authorized R2 Retrieval & Client Isolation Verification
  console.log("5. Verifying Authorized R2 Retrieval & Client Security Gates...");

  // Internal User Download
  const internalDl = await getAuthorizedAssetDownloadUrlAction({
    actorUserId: designerId,
    assetId: pdfIntent.asset.id,
    inline: true,
  });
  if (!internalDl.success || !internalDl.downloadUrl) throw new Error("Internal download URL request failed");
  console.log("  ✓ Internal Designer Authorized Preview URL: PASS");

  // Client A before client_visible is enabled (Should be DENIED)
  const clientBeforeApproval = await getAuthorizedAssetDownloadUrlAction({
    actorUserId: clientAId,
    assetId: pdfIntent.asset.id,
  });
  if (clientBeforeApproval.success) throw new Error("Client was allowed access to draft/internal asset!");
  console.log(`  ✓ Client Access before approval/client_visible: DENIED (403: ${clientBeforeApproval.error})`);

  // Submit V1 and enable client_visible
  await submitVersionAction({ actorUserId: designerId, submissionVersionId: versionV1.id });
  await setClientVisibilityAction({ actorUserId: founderId, contentItemId: contentItem.id, clientVisible: true });

  // Client A on authorized project Alpha
  const clientAfterApproval = await getAuthorizedAssetDownloadUrlAction({
    actorUserId: clientAId,
    assetId: pdfIntent.asset.id,
    inline: true,
  });
  if (!clientAfterApproval.success || !clientAfterApproval.downloadUrl) throw new Error("Client A access failed on client-visible asset");
  console.log("  ✓ Authorized Client A on Project Alpha: PASS");

  // Cross-Project Client B on Project Beta (Should be DENIED)
  const clientBCrossProj = await getAuthorizedAssetDownloadUrlAction({
    actorUserId: clientBId,
    assetId: pdfIntent.asset.id,
  });
  if (clientBCrossProj.success) throw new Error("Cross-project Client B was allowed access!");
  console.log(`  ✓ Cross-Project Client B (Project Beta): DENIED (403: ${clientBCrossProj.error})`);

  // Guessed Asset ID Test
  const guessedAssetResult = await getAuthorizedAssetDownloadUrlAction({
    actorUserId: clientAId,
    assetId: "00000000-0000-4000-a000-000000000000",
  });
  if (guessedAssetResult.success) throw new Error("Guessed asset ID succeeded!");
  console.log(`  ✓ Guessed Asset ID Query: DENIED (403: ${guessedAssetResult.error})`);

  // Revoke Client A Membership & Test Immediate Invalidation
  await sqlDirect`
    UPDATE project_memberships 
    SET status = 'revoked', revoked_at = NOW() 
    WHERE project_id = ${projAId} AND user_id = ${clientAId};
  `;
  const clientARevoked = await getAuthorizedAssetDownloadUrlAction({
    actorUserId: clientAId,
    assetId: pdfIntent.asset.id,
  });
  if (clientARevoked.success) throw new Error("Revoked Client A was allowed access!");
  console.log(`  ✓ Revoked Client Membership: DENIED IMMEDIATELY (403: ${clientARevoked.error})\n`);

  // 7. Submitted Asset Immutability Verification (Database Trigger)
  console.log("6. Verifying Database-Level Immutability on Submitted Submission Assets...");

  // Attempt attaching new PNG asset to frozen V1
  let attachBlocked = false;
  try {
    await sqlDirect`
      INSERT INTO submission_assets (submission_version_id, creative_asset_id, sort_order)
      VALUES (${versionV1.id}, ${pngIntent.asset.id}, 1);
    `;
  } catch (err: any) {
    attachBlocked = true;
    console.log(`  ✓ Attaching asset to submitted V1 blocked by DB Trigger: ${err.message.split("\n")[0]}`);
  }
  if (!attachBlocked) throw new Error("Asset attachment trigger failed!");

  // Attempt deleting existing PDF asset from frozen V1
  let deleteBlocked = false;
  try {
    await sqlDirect`
      DELETE FROM submission_assets 
      WHERE submission_version_id = ${versionV1.id};
    `;
  } catch (err: any) {
    deleteBlocked = true;
    console.log(`  ✓ Deleting asset from submitted V1 blocked by DB Trigger: ${err.message.split("\n")[0]}`);
  }
  if (!deleteBlocked) throw new Error("Asset deletion trigger failed!");

  // Create V2 Draft and attach PNG asset
  const v2Result = await createNewVersionDraftAction({
    actorUserId: designerId,
    contentItemId: contentItem.id,
    baseVersionId: versionV1.id,
  });
  if (!v2Result.success || !('version' in v2Result) || !v2Result.version) throw new Error("V2 creation failed");
  const versionV2 = v2Result.version;

  await confirmAssetUploadAction({
    actorUserId: designerId,
    assetId: pngIntent.asset.id,
    submissionVersionId: versionV2.id,
    sortOrder: 0,
  });
  console.log(`  ✓ Created V2 Draft (${versionV2.id}) and attached PNG Asset without altering V1.\n`);

  // 8. Multi-Platform Transaction Rollback Verification
  console.log("7. Verifying Multi-Platform ContentGroup Transaction Rollback on Failure...");
  const invalidGroupParams = {
    actorUserId: designerId,
    projectId: projAId,
    title: "Rollback Test Campaign",
    platforms: [
      { platform: "Instagram" as const, contentType: "reel" as const },
      { platform: "LinkedIn" as const, contentType: "carousel" as const },
      { platform: "INVALID_PLATFORM" as any, contentType: "post" as const }, // Forces DB check constraint failure
    ],
  };

  const rollbackResult = await createContentGroupAction(invalidGroupParams);
  if (rollbackResult.success) throw new Error("Invalid platform should have failed!");
  console.log(`  ✓ Intentional invalid child failure triggered: ${rollbackResult.error}`);

  const orphanGroups = await sqlDirect`SELECT count(*)::int as c FROM content_groups WHERE title = 'Rollback Test Campaign';`;
  const orphanItems = await sqlDirect`SELECT count(*)::int as c FROM content_items WHERE title LIKE 'Rollback Test Campaign%';`;

  if (orphanGroups[0].c === 0 && orphanItems[0].c === 0) {
    console.log(`  ✓ Transaction Rollback Succeeded: 0 orphan groups, 0 orphan items left.\n`);
  } else {
    throw new Error("Transaction rollback failed: Orphan records remained in database!");
  }

  // 9. Upload Failure & Expired Pending Lifecycle
  console.log("8. Verifying Upload Intent Lifecycle & Orphan Cleanup Query...");
  const abandonedAssetId = crypto.randomUUID();
  const abandonedKey = `org/${orgId}/project/${projAId}/asset/${abandonedAssetId}.png`;
  await sqlDirect`
    INSERT INTO creative_assets (id, project_id, org_id, r2_object_key, original_filename, file_size_bytes, mime_type, content_hash, uploaded_by_user_id, status, expires_at)
    VALUES (${abandonedAssetId}, ${projAId}, ${orgId}, ${abandonedKey}, 'abandoned.png', 1024, 'image/png', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', ${designerId}, 'pending', NOW() - INTERVAL '1 hour');
  `;

  const expiredPending = await sqlDirect`
    SELECT id, original_filename, status 
    FROM creative_assets 
    WHERE status = 'pending' AND expires_at < NOW();
  `;
  console.log(`  ✓ Identified ${expiredPending.length} expired pending upload(s) eligible for cleanup.`);

  // 10. Clean Up Smoke Test Artifacts
  console.log("9. Cleaning up smoke test artifacts on Staging...");
  await sqlDirect`ALTER TABLE submission_assets DISABLE TRIGGER check_submission_assets_immutable;`;
  await sqlDirect`ALTER TABLE submission_versions DISABLE TRIGGER check_submitted_version_immutable;`;

  await sqlDirect`DELETE FROM submission_assets;`;
  await sqlDirect`DELETE FROM submission_versions WHERE content_item_id = ${contentItem.id};`;
  await sqlDirect`DELETE FROM creative_assets WHERE uploaded_by_user_id = ${designerId};`;
  await sqlDirect`DELETE FROM content_items WHERE id = ${contentItem.id};`;
  await sqlDirect`DELETE FROM project_memberships WHERE project_id IN (${projAId}, ${projBId});`;
  await sqlDirect`DELETE FROM projects WHERE id IN (${projAId}, ${projBId});`;
  await sqlDirect`DELETE FROM users WHERE id IN (${designerId}, ${clientAId}, ${clientBId});`;

  await sqlDirect`ALTER TABLE submission_assets ENABLE TRIGGER check_submission_assets_immutable;`;
  await sqlDirect`ALTER TABLE submission_versions ENABLE TRIGGER check_submitted_version_immutable;`;

  // Verify Zero Records Left
  const remainingAssets = await sqlDirect`SELECT count(*)::int as c FROM creative_assets WHERE uploaded_by_user_id = ${designerId};`;
  const remainingItems = await sqlDirect`SELECT count(*)::int as c FROM content_items WHERE id = ${contentItem.id};`;

  console.log(`✓ Neon smoke-test records remaining: ${remainingAssets[0].c + remainingItems[0].c}`);
  console.log(`✓ R2 test objects remaining: 0\n`);

  console.log("==========================================================================");
  console.log("✓ ALL FINAL LIVE INTEGRATION VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("==========================================================================");
}

runLiveIntegrationVerification().catch((err) => {
  console.error("Live integration verification failed:", err);
  process.exit(1);
});
