/**
 * Production Environment Safety Guard
 * 
 * Enforces a strict boundary preventing automated tests, smoke tests,
 * verification scripts, and fixture generators from executing mutations
 * against the production Neon database or production Cloudflare R2 bucket.
 */

export function assertNonProductionEnvironment(operationName = "Automated Test / Fixture Operation"): void {
  const dbUrl = process.env.DATABASE_URL || "";
  const unpooledDbUrl = process.env.DATABASE_URL_UNPOOLED || "";
  const r2Bucket = process.env.R2_BUCKET_NAME || "";
  const envTarget = process.env.ACECORE_ENV || "";

  // 1. Production database markers
  const isProductionDb =
    dbUrl.includes("ep-dry-forest-azifaoyz") ||
    unpooledDbUrl.includes("ep-dry-forest-azifaoyz") ||
    dbUrl.includes("production");

  // 2. Production R2 bucket marker
  const isProductionR2 = r2Bucket === "acecore-vault-production";

  // 3. Reject if target is production or ACECORE_ENV is not explicitly "staging" / "test"
  if (isProductionDb || isProductionR2 || (envTarget !== "staging" && envTarget !== "test")) {
    const errorMsg =
      `[CRITICAL PRODUCTION SAFETY VIOLATION] Refused to execute "${operationName}"!\n` +
      `- Reason: Target environment is production or not designated as safe test target.\n` +
      `- Production DB Detected: ${isProductionDb}\n` +
      `- Production R2 Detected: ${isProductionR2}\n` +
      `- ACECORE_ENV: "${envTarget}" (Required: "staging" or "test")\n` +
      `Automated tests and scripts must NEVER mutate the production database.`;

    throw new Error(errorMsg);
  }
}
