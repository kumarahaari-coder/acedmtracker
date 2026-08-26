import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { getEmptyAppState } from "@/lib/state/empty";

describe("Production Mode & Prototype Leakage Guard", () => {
  it("1. Header component must not contain prototype banner, reset data, or role simulation", () => {
    const headerPath = path.join(process.cwd(), "components/layout/Header.tsx");
    const content = fs.readFileSync(headerPath, "utf-8");

    expect(content).not.toContain("Interactive Phase A prototype using synthetic sample data");
    expect(content).not.toContain("Reset Sample Data");
    expect(content).not.toContain("Role Simulation");
    expect(content).not.toContain("Vikram Shah");
    expect(content).not.toContain("Priyah Sharma");
    expect(content).not.toContain("Rohan Verma");
    expect(content).not.toContain("Dr. Ramesh Mehta");
    expect(content).not.toContain("Alex Mercer");
  });

  it("2. Initial workspace state must be completely clean and empty (0 mock projects)", () => {
    const emptyState = getEmptyAppState();
    expect(emptyState.projects).toHaveLength(0);
    expect(emptyState.contentItems).toHaveLength(0);
    expect(emptyState.users).toHaveLength(0);
    expect(emptyState.workSessions).toHaveLength(0);
    expect(emptyState.submissionVersions).toHaveLength(0);
  });

  it("3. Middleware must be configured to protect all application routes", () => {
    const middlewarePath = path.join(process.cwd(), "middleware.ts");
    expect(fs.existsSync(middlewarePath)).toBe(true);

    const content = fs.readFileSync(middlewarePath, "utf-8");
    expect(content).toContain("auth");
    expect(content).toContain("/api/auth/signin");
  });
});
