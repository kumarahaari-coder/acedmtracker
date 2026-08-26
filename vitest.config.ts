import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.production.local" });
dotenv.config({ path: ".env.local" });

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
