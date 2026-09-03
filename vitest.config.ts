import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";

// Load environment configuration safely
if (process.env.DOTENV_CONFIG_PATH && fs.existsSync(process.env.DOTENV_CONFIG_PATH)) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, override: true });
} else if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}

// Global safety check: ABORT IMMEDIATELY if target database or R2 bucket belongs to production
const dbUrl = process.env.DATABASE_URL || "";
const unpooledDbUrl = process.env.DATABASE_URL_UNPOOLED || "";
const r2Bucket = process.env.R2_BUCKET_NAME || "";

if (
  dbUrl.includes("ep-dry-forest-azifaoyz") ||
  unpooledDbUrl.includes("ep-dry-forest-azifaoyz") ||
  r2Bucket === "acecore-vault-production"
) {
  throw new Error(
    `[CRITICAL PRODUCTION SAFETY VIOLATION] Vitest configuration aborted!\n` +
    `  - Production DB Host: "${dbUrl.split("@")[1]?.split("/")[0] || "ep-dry-forest-azifaoyz"}"\n` +
    `  - Production R2 Bucket: "${r2Bucket}"\n` +
    `  Automated test suites MUST NEVER run against production infrastructure.`
  );
}

// Set explicit test environment variables
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
(process.env as Record<string, string | undefined>).ACECORE_ENV = "test";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
