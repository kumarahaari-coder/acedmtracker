import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Strictly load safe local staging environment for testing - NEVER load production env files
dotenv.config({ path: ".env.local" });

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
