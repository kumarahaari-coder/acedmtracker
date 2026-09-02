import { neon } from "@neondatabase/serverless";

async function main() {
  const prodUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "";
  const sql = neon(prodUrl);

  console.log("=== Querying Production Neon DB (ep-dry-forest-azifaoyz) ===");
  const projects = await sql`
    SELECT id, legacy_id, org_id, name, client_name, tier, engagement_model, status, created_at, updated_at
    FROM projects
    ORDER BY created_at DESC
  `;
  console.log("Total Projects in Production DB:", projects.length);
  console.log(JSON.stringify(projects, null, 2));

  console.log("\n=== Checking for 'proj_edwzpz9wd' ===");
  const specific = await sql`
    SELECT * FROM projects WHERE legacy_id = 'proj_edwzpz9wd' OR id::text = 'proj_edwzpz9wd'
  `;
  console.log("Match count for proj_edwzpz9wd:", specific.length);
  if (specific.length > 0) {
    console.log(JSON.stringify(specific, null, 2));
  } else {
    console.log("RESULT: No database row with legacy_id or id 'proj_edwzpz9wd' exists in production PostgreSQL.");
  }
}

main().catch(console.error);
