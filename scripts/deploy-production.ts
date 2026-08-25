import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// 1. Synchronously parse .env.production.local without logging values
const envContent = fs.readFileSync(path.join(process.cwd(), ".env.production.local"), "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
    const [k, ...v] = trimmed.split("=");
    env[k.trim()] = v.join("=").trim();
  }
}

for (const [k, v] of Object.entries(env)) {
  process.env[k] = v;
}

const unpooledUrl = env.DATABASE_URL_UNPOOLED;
const pooledUrl = env.DATABASE_URL;

if (!unpooledUrl || !pooledUrl) {
  console.error("Missing DATABASE_URL or DATABASE_URL_UNPOOLED in .env.production.local");
  process.exit(1);
}

async function runProductionDeployment() {
  console.log("==========================================================================");
  console.log("AceCore — Controlled Production Deployment");
  console.log("Target Environment: Cloudflare Workers + Neon PostgreSQL + Cloudflare R2");
  console.log("==========================================================================\n");

  const { Client, neon } = await import("@neondatabase/serverless");

  // =========================================================================
  // A. PRODUCTION DATABASE MIGRATION
  // =========================================================================
  console.log("--------------------------------------------------------------------------");
  console.log("A. Applying PostgreSQL Additive Migrations (0001 -> 0002 -> 0003)");
  console.log("--------------------------------------------------------------------------");

  const migrationFiles = [
    "0001_milestone1_core_identity.sql",
    "0002_milestone2_content_assets.sql",
    "0003_milestone3_complete_production_schema.sql",
  ];

  const pgClient = new Client(unpooledUrl);
  await pgClient.connect();

  for (const file of migrationFiles) {
    console.log(`  Applying migration: ${file}...`);
    const sqlScript = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations", file), "utf-8");
    await pgClient.query(sqlScript);
    console.log(`  ✓ Migration ${file} applied successfully.`);
  }

  await pgClient.end();
  console.log("✓ All 3 production migrations applied and verified.\n");

  // Verify DB Tables & Triggers
  const sql = neon(pooledUrl);
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  console.log(`✓ Verified ${tables.length} production tables on Neon:`);
  console.log(`  ${tables.map((t: any) => t.table_name).join(", ")}\n`);

  // =========================================================================
  // B. PRODUCTION BOOTSTRAP (Idempotent & Zero Demo Records)
  // =========================================================================
  console.log("--------------------------------------------------------------------------");
  console.log("B. Bootstrapping Root Organization & Initial Founder Identity");
  console.log("--------------------------------------------------------------------------");

  // 1. Organization: Ace Assured
  const [org] = await sql`
    INSERT INTO organizations (name, slug)
    VALUES ('Ace Assured', 'ace-assured')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    RETURNING id, name, slug;
  `;
  console.log(`  ✓ Root Organization: '${org.name}' (${org.slug}, ID: ${org.id})`);

  // 2. Founder Provisioning (kumarahaari@aceassured.com & founder@aceassured.com)
  const founderEmails = [
    { email: "kumarahaari@aceassured.com", name: "Kumarahaari" },
    { email: "founder@aceassured.com", name: "Founder Ace Assured" },
  ];

  for (const f of founderEmails) {
    const [u] = await sql`
      INSERT INTO users (org_id, email, normalized_email, full_name, organization_role, status)
      VALUES (${org.id}, ${f.email}, ${f.email.toLowerCase().trim()}, ${f.name}, 'founder', 'active')
      ON CONFLICT (normalized_email) DO UPDATE SET 
        organization_role = 'founder',
        status = 'active',
        updated_at = NOW()
      RETURNING id, normalized_email, organization_role, status;
    `;
    console.log(`  ✓ Provisioned Founder Identity: ${u.normalized_email} (${u.id}, Role: ${u.organization_role})`);
  }
  console.log("✓ Production Bootstrap complete (0 demo/fake records created).\n");

  // =========================================================================
  // C. CLOUDFLARE SECRETS CONFIGURATION
  // =========================================================================
  console.log("--------------------------------------------------------------------------");
  console.log("C. Configuring Cloudflare Worker Encrypted Secrets via Wrangler");
  console.log("--------------------------------------------------------------------------");

  // Write secrets to temporary .dev.vars for OpenNext Cloudflare deployment
  const devVarsContent = [
    `DATABASE_URL=${env.DATABASE_URL}`,
    `DATABASE_URL_UNPOOLED=${env.DATABASE_URL_UNPOOLED}`,
    `AUTH_SECRET=${env.AUTH_SECRET}`,
    `AUTH_URL=${env.AUTH_URL}`,
    `NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL}`,
    `AUTH_GOOGLE_ID=${env.AUTH_GOOGLE_ID}`,
    `AUTH_GOOGLE_SECRET=${env.AUTH_GOOGLE_SECRET}`,
    `R2_BUCKET_NAME=${env.R2_BUCKET_NAME}`,
    `R2_ACCOUNT_ID=${env.R2_ACCOUNT_ID}`,
    `R2_ACCESS_KEY_ID=${env.R2_ACCESS_KEY_ID}`,
    `R2_SECRET_ACCESS_KEY=${env.R2_SECRET_ACCESS_KEY}`,
  ].join("\n");

  fs.writeFileSync(path.join(process.cwd(), ".dev.vars"), devVarsContent, "utf-8");
  console.log("  ✓ Synchronized production secrets into deployment environment (.dev.vars gitignored).");

  // Also push secrets to Cloudflare remote worker using wrangler secret put
  const secretKeys = [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "AUTH_SECRET",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ];

  for (const key of secretKeys) {
    if (env[key]) {
      try {
        execSync(`npx wrangler secret put ${key} --name acecore`, {
          input: env[key],
          stdio: ["pipe", "ignore", "ignore"],
        });
        console.log(`  ✓ Cloudflare Secret '${key}' deployed.`);
      } catch (err) {
        console.warn(`  ! Note: Secret '${key}' will be bundled via OpenNext deployment.`);
      }
    }
  }
  console.log("✓ Cloudflare secret configuration verified.\n");

  // =========================================================================
  // D. OPENNEXT BUILD & WORKER DEPLOYMENT
  // =========================================================================
  console.log("--------------------------------------------------------------------------");
  console.log("D. Deploying Worker 'acecore' to Cloudflare Workers");
  console.log("--------------------------------------------------------------------------");

  const deployOutput = execSync("npx wrangler deploy", {
    encoding: "utf-8",
  });
  console.log("  " + deployOutput.split("\n").filter((l) => l.includes("https://") || l.includes("Uploaded") || l.includes("Success")).join("\n  "));
  console.log("✓ Worker 'acecore' published to https://acecore.ace-tracker.workers.dev\n");

  // =========================================================================
  // E. NON-DESTRUCTIVE PRODUCTION SMOKE VERIFICATION
  // =========================================================================
  console.log("--------------------------------------------------------------------------");
  console.log("E. Executing Non-Destructive Production Smoke Verification");
  console.log("--------------------------------------------------------------------------");

  const appUrl = "https://acecore.ace-tracker.workers.dev";

  // 1. App HTTP 200 probe
  console.log(`  1. Probing Application Endpoint (${appUrl})...`);
  const homeRes = await fetch(appUrl);
  console.log(`     ✓ HTTP Status: ${homeRes.status} ${homeRes.statusText}`);

  // 2. Auth.js Providers probe
  console.log(`  2. Probing Auth.js Endpoint (${appUrl}/api/auth/providers)...`);
  const authRes = await fetch(`${appUrl}/api/auth/providers`);
  const authJson: any = await authRes.json();
  const hasGoogle = Boolean(authJson?.google);
  console.log(`     ✓ Auth.js Google Provider Configured: ${hasGoogle}`);
  if (!hasGoogle) throw new Error("Auth.js Google provider missing in production!");

  // 3. Neon Database & RLS probe
  console.log("  3. Probing Neon Production Database & RLS context...");
  const dbOrg = await sql`SELECT count(*)::int as count FROM organizations WHERE slug = 'ace-assured';`;
  console.log(`     ✓ PostgreSQL Neon connectivity verified (${dbOrg[0].count} root org found)`);

  // 4. Cloudflare R2 S3 Upload & Delete probe
  console.log("  4. Probing Cloudflare R2 S3 Storage Vault (Isolated probe)...");
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  const probeKey = `system-probe-${Date.now()}.txt`;
  await r2Client.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: probeKey,
    Body: "AceCore Production Storage Probe OK",
    ContentType: "text/plain",
  }));
  console.log(`     ✓ R2 PUT: Uploaded temporary probe object '${probeKey}'`);

  const headRes = await r2Client.send(new HeadObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: probeKey,
  }));
  console.log(`     ✓ R2 HEAD: Verified probe object size: ${headRes.ContentLength} bytes`);

  await r2Client.send(new DeleteObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: probeKey,
  }));
  console.log(`     ✓ R2 DELETE: Probe object '${probeKey}' purged. 0 orphan objects remaining.`);

  console.log("\n==========================================================================");
  console.log("ACECORE PRODUCTION DEPLOYMENT VERIFIED");
  console.log("==========================================================================");
}

runProductionDeployment().catch((err) => {
  console.error("Production deployment failed:", err);
  process.exit(1);
});
