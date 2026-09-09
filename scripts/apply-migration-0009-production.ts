import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.production.local" });

async function main() {
  const prodUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!prodUrl) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL not found in .env.production.local");
  }

  if (!prodUrl.includes("ep-dry-forest-azifaoyz")) {
    throw new Error(`Safety guard: Target host is not production (ep-dry-forest-azifaoyz): ${prodUrl}`);
  }

  const sql = neon(prodUrl);

  console.log("=== Applying Migration 0009 to Production Neon (ep-dry-forest-azifaoyz) ===");

  await sql`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) NOT NULL DEFAULT 'digital_marketing';
  `;
  console.log("✓ Added project_type to projects table");

  await sql`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS master_figma_url TEXT;
  `;
  console.log("✓ Added master_figma_url to projects table");

  await sql`
    ALTER TABLE content_items ADD COLUMN IF NOT EXISTS figma_url TEXT;
  `;
  console.log("✓ Added figma_url to content_items table");

  await sql`
    ALTER TABLE content_items ADD COLUMN IF NOT EXISTS client_delivery_date TIMESTAMPTZ;
  `;
  console.log("✓ Added client_delivery_date to content_items table");

  console.log("\n=== Verifying Production Schema Columns ===");
  const projectCols = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name IN ('project_type', 'master_figma_url');
  `;
  console.log("Projects Columns:", projectCols);

  const contentCols = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'content_items' AND column_name IN ('figma_url', 'client_delivery_date');
  `;
  console.log("Content Items Columns:", contentCols);

  console.log("\n=== Verifying Existing Production Projects ===");
  const existingProjects = await sql`
    SELECT id, name, project_type, master_figma_url
    FROM projects
    LIMIT 5;
  `;
  console.log("Sample Existing Production Projects:", existingProjects);

  console.log("\n=== Migration 0009 Production Execution Complete ===");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
