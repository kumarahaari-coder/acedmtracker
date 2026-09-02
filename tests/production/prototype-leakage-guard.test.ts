import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { getEmptyAppState } from "@/lib/state/empty";
import { loadStoredState, resetStoredState } from "@/lib/migrations";

describe("Production Mode & Prototype Leakage Guard", () => {
  it("1. UI components and app directory must not contain sample data, sample project names, or prototype controls", () => {
    const checkDirs = ["components", "app"];
    const forbiddenTokens = [
      "Interactive Phase A prototype using synthetic sample data",
      "Reset Sample Data",
      "Role Simulation",
      "Vikram Shah",
      "Priyah Sharma",
      "Rohan Verma",
      "Dr. Ramesh Mehta",
      "Alex Mercer",
      "Acme Health",
      "Acme Healthcare",
      "proj_acme",
      "u_founder",
      "u_admin",
      "u_consultant",
      "u_designer1",
      "u_client_acme",
    ];

    function scanDir(dir: string) {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) return;
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(fullDir, entry.name);
        if (entry.isDirectory()) {
          scanDir(path.join(dir, entry.name));
        } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
          const content = fs.readFileSync(fullPath, "utf-8");
          for (const token of forbiddenTokens) {
            expect(content, `Forbidden token "${token}" found in ${fullPath}`).not.toContain(token);
          }
        }
      }
    }

    for (const d of checkDirs) {
      scanDir(d);
    }
  });

  it("2. AppStateContext & migrations must strictly gate mockData under NODE_ENV === 'test' and never in production path", () => {
    const contextPath = path.join(process.cwd(), "lib/context/AppStateContext.tsx");
    const migrationsPath = path.join(process.cwd(), "lib/migrations.ts");

    const contextContent = fs.readFileSync(contextPath, "utf-8");
    const migrationsContent = fs.readFileSync(migrationsPath, "utf-8");

    expect(contextContent).toContain('process.env.NODE_ENV === "test"');
    expect(migrationsContent).not.toContain("getInitialDeterministicState");
    expect(migrationsContent).not.toContain("mockData");
  });

  it("3. Initial workspace state must be completely clean and empty (0 mock projects/items/assignments)", () => {
    const emptyState = getEmptyAppState();
    expect(emptyState.projects).toHaveLength(0);
    expect(emptyState.contentItems).toHaveLength(0);
    expect(emptyState.users).toHaveLength(0);
    expect(emptyState.workSessions).toHaveLength(0);
    expect(emptyState.submissionVersions).toHaveLength(0);
    expect(emptyState.contentAssignments).toHaveLength(0);
    expect(emptyState.attendanceRecords).toHaveLength(0);
  });

  it("4. loadStoredState and resetStoredState must never return synthetic sample data", () => {
    const loaded = loadStoredState();
    expect(loaded.state.projects).toHaveLength(0);
    expect(loaded.state.contentItems).toHaveLength(0);
    expect(loaded.state.users).toHaveLength(0);

    const reset = resetStoredState();
    expect(reset.projects).toHaveLength(0);
    expect(reset.contentItems).toHaveLength(0);
    expect(reset.users).toHaveLength(0);
  });

  it("5. Middleware must be configured to protect all application routes", () => {
    const middlewarePath = path.join(process.cwd(), "middleware.ts");
    expect(fs.existsSync(middlewarePath)).toBe(true);

    const content = fs.readFileSync(middlewarePath, "utf-8");
    expect(content).toContain("auth");
    expect(content).toContain("/api/auth/signin");
  });
});
