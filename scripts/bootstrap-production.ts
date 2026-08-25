import { db } from "../lib/db";
import { organizations, users } from "../lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Production Bootstrap Command
 * Securely provisions the root organization and initial Founder account.
 * Run once during initial deployment or staging setup.
 */
export async function bootstrapProduction(initialFounderEmail = "founder@aceassured.com", founderName = "Ace Assured Founder") {
  console.log("Starting AceCore Production Bootstrap...");

  const normalizedEmail = initialFounderEmail.toLowerCase().trim();

  // 1. Ensure Root Organization exists
  let org = await db.select().from(organizations).where(eq(organizations.slug, "ace-assured")).limit(1);

  let orgId: string;
  if (org.length === 0) {
    const newOrg = await db
      .insert(organizations)
      .values({
        name: "Ace Assured",
        slug: "ace-assured",
      })
      .returning({ id: organizations.id });
    orgId = newOrg[0].id;
    console.log(`✓ Created primary organization 'Ace Assured' (${orgId})`);
  } else {
    orgId = org[0].id;
    console.log(`✓ Primary organization 'Ace Assured' already exists (${orgId})`);
  }

  // 2. Ensure initial Founder user is provisioned
  let founder = await db.select().from(users).where(eq(users.normalizedEmail, normalizedEmail)).limit(1);

  if (founder.length === 0) {
    const newFounder = await db
      .insert(users)
      .values({
        orgId,
        email: initialFounderEmail,
        normalizedEmail,
        fullName: founderName,
        organizationRole: "founder",
        status: "active",
      })
      .returning({ id: users.id });
    console.log(`✓ Provisioned initial Founder user: ${normalizedEmail} (${newFounder[0].id})`);
  } else {
    console.log(`✓ Initial Founder user already provisioned: ${normalizedEmail} (${founder[0].id})`);
  }

  console.log("AceCore Production Bootstrap complete.");
}
