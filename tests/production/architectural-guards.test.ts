import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseGraphqlTimings, parseTailTimings } from "../../lib/telemetry/formatters";

describe("Architectural Regression Guards — Cloudflare 1102 & Worker CPU Safety", () => {
  const rootDir = path.resolve(__dirname, "../../");

  it("1. fetchAuthoritativeWorkspaceEntities is completely absent from all actions and layouts", () => {
    const forbiddenToken = "fetchAuthoritativeWorkspaceEntities";
    const scanDirs = ["app", "lib/actions"];

    function scan(dir: string) {
      const fullPath = path.join(rootDir, dir);
      if (!fs.existsSync(fullPath)) return;
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        if (entry.isDirectory()) {
          scan(path.relative(rootDir, entryPath));
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          const content = fs.readFileSync(entryPath, "utf8");
          if (content.includes(forbiddenToken)) {
            throw new Error(`Architectural violation: ${forbiddenToken} found in ${path.relative(rootDir, entryPath)}`);
          }
        }
      }
    }

    scanDirs.forEach(scan);
  });

  it("2. app/portal/layout.tsx does NOT hydrate the internal workspace state or use useAppState", () => {
    const portalLayoutPath = path.join(rootDir, "app/portal/layout.tsx");
    expect(fs.existsSync(portalLayoutPath)).toBe(true);
    const content = fs.readFileSync(portalLayoutPath, "utf8");

    expect(content.includes("getAuthoritativeWorkspaceStateAction")).toBe(false);
    expect(content.includes("useAppState")).toBe(false);
    expect(content.includes("getAuthoritativePortalContextAction")).toBe(true);
  });

  it("3. Telemetry formatters preserve canonical millisecond units across tail and GraphQL telemetry", () => {
    // Tail integer milliseconds
    const tailParsed = parseTailTimings(4, 38);
    expect(tailParsed.cpuTimeMs).toBe(4);
    expect(tailParsed.wallTimeMs).toBe(38);

    // GraphQL microseconds correctly divided by 1000 to ms
    const gqlParsed = parseGraphqlTimings(10000, 52000);
    expect(gqlParsed.cpuTimeMs).toBe(10.0);
    expect(gqlParsed.wallTimeMs).toBe(52.0);
  });
});
