import { neon } from "@neondatabase/serverless";

async function main() {
  const stagingUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "";
  const sql = neon(stagingUrl);

  console.log("=== Querying Staging Neon DB (ep-red-waterfall-azbw2scy) ===");
  const projects = await sql`
    SELECT id, legacy_id, org_id, name, client_name, tier, engagement_model, status, created_at, updated_at
    FROM projects
    ORDER BY created_at DESC
  `;
  console.log("Total Projects in Staging DB:", projects.length);
  console.log(JSON.stringify(projects, null, 2));

  console.log("\n=== Checking for 'proj_edwzpz9wd' in Staging ===");
  const specific = await sql`
    SELECT * FROM projects WHERE legacy_id = 'proj_edwzpz9wd' OR id::text = 'proj_edwzpz9wd'
  `;
  console.log("Match count for proj_edwzpz9wd:", specific.length);
  if (specific.length > 0) {
    console.log(JSON.stringify(specific, null, 2));
  } else {
    console.log("RESULT: No database row with legacy_id or id 'proj_edwzpz9wd' exists in Staging PostgreSQL.");
  }
}

main().catch(console.error);
