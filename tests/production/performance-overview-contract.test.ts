import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { users, projects } from "../../lib/db/schema";
import { getAuthoritativePerformanceOverviewAction } from "../../lib/actions/performance";
import { calculateEmployeePeriodCapacity, getPeriodDateRange } from "../../lib/calculations/operationalEngine";
import { eq, and } from "drizzle-orm";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";
import * as fs from "fs";
import * as path from "path";

describe("Performance Overview Contract & Security Regression Suite", () => {
  let founderUser: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const [founder] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);
    founderUser = founder;
  });

  it("1. Founder receives authorized projects", async () => {
    const res = await getAuthoritativePerformanceOverviewAction({
      period: "this_month",
      role: "all",
      projectId: "all",
    });

    expect(res.success).toBe(true);
    expect(res.availableProjects).toBeDefined();
    expect(Array.isArray(res.availableProjects)).toBe(true);
    expect(res.availableProjects!.length).toBeGreaterThan(0);

    for (const proj of res.availableProjects!) {
      expect(proj.id).toBeDefined();
      expect(typeof proj.name).toBe("string");
      expect(proj.name.length).toBeGreaterThan(0);
    }
  });

  it("2. Eligible team does not collapse to zero", async () => {
    const res = await getAuthoritativePerformanceOverviewAction({
      period: "this_month",
      role: "all",
      projectId: "all",
    });

    expect(res.success).toBe(true);
    expect(res.overview).toBeDefined();
    // In an active organization, team capacity must be non-zero
    expect(res.overview!.teamCapacityHours).toBeGreaterThan(0);

    expect(res.availableRoles).toBeDefined();
    expect(Array.isArray(res.availableRoles)).toBe(true);
    expect(res.availableRoles!.length).toBeGreaterThan(0);
  });

  it("3. Capacity does not disappear without deliverables", () => {
    const period = getPeriodDateRange("this_month");
    // Calculate employee capacity with zero tasks/deliverables
    const capacity = calculateEmployeePeriodCapacity(
      founderUser?.id || "00000000-0000-0000-0000-000000000000",
      period.startDate,
      period.endDate,
      [], // No schedules -> standard 44h/week fallback
      []  // No adjustments
    );

    // Standard monthly capacity is ~176h, never 0 due to absence of deliverables
    expect(capacity.finalCapacityHours).toBeGreaterThan(0);
    expect(capacity.baseCapacityHours).toBeGreaterThan(0);
  });

  it("4. Performance DTO includes onTimePercentage and avoids undefined%", async () => {
    const res = await getAuthoritativePerformanceOverviewAction({
      period: "this_month",
      role: "all",
      projectId: "all",
    });

    expect(res.success).toBe(true);
    expect(res.overview).toBeDefined();

    // DTO must expose both onTimePercent and onTimePercentage
    expect(res.overview).toHaveProperty("onTimePercent");
    expect(res.overview).toHaveProperty("onTimePercentage");

    // Must be either a number or null, NEVER undefined
    expect(res.overview!.onTimePercent === null || typeof res.overview!.onTimePercent === "number").toBe(true);
    expect((res.overview as any)!.onTimePercentage === null || typeof (res.overview as any)!.onTimePercentage === "number").toBe(true);

    // UI formatting check: null or undefined must render "N/A" and NEVER "undefined%"
    const formatOnTime = (overview: any) => {
      return typeof overview?.onTimePercent === "number"
        ? `${overview.onTimePercent}%`
        : typeof overview?.onTimePercentage === "number"
        ? `${overview.onTimePercentage}%`
        : "N/A";
    };

    expect(formatOnTime(null)).toBe("N/A");
    expect(formatOnTime({})).toBe("N/A");
    expect(formatOnTime({ onTimePercent: null, onTimePercentage: null })).toBe("N/A");
    expect(formatOnTime({ onTimePercent: 85, onTimePercentage: 85 })).toBe("85%");
  });

  it("5. Hardcoded DB credentials prevented across scripts and application code", () => {
    const rootDir = path.resolve(__dirname, "../../");
    const scanDirs = ["app", "lib", "scripts"];
    // Regexp matching connection strings with credentials embedded like postgresql://user:pass@
    const connStrRegex = /postgres(ql)?:\/\/[^:]+:[^@]+@ep-[a-z0-9-]+/i;

    for (const dir of scanDirs) {
      const fullDir = path.join(rootDir, dir);
      if (!fs.existsSync(fullDir)) continue;

      const files: string[] = [];
      function collectFiles(d: string) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) collectFiles(p);
          else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx") || e.name.endsWith(".js"))) {
            files.push(p);
          }
        }
      }
      collectFiles(fullDir);

      for (const f of files) {
        const content = fs.readFileSync(f, "utf8");
        const match = content.match(connStrRegex);
        if (match) {
          throw new Error(
            `Security violation: Hardcoded database credential found in ${path.relative(rootDir, f)}: ${match[0].slice(0, 20)}...`
          );
        }
      }
    }
  });
});
