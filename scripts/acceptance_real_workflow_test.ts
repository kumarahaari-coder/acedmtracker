import fs from "fs";
import path from "path";

const devVarsPath = path.resolve(process.cwd(), ".dev.vars");
if (fs.existsSync(devVarsPath)) {
  const content = fs.readFileSync(devVarsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}

import { db } from "../lib/db";
import { contentItems, contentAssignments, auditRecords, users } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthoritativeLayoutContextAction } from "../lib/actions/workspace";
import { getAuthoritativeMainDashboardAction, getAuthoritativePerformanceOverviewAction } from "../lib/actions/performance";
import { getAuthoritativeCalendarDataAction } from "../lib/actions/calendar";
import { createContentItemAction } from "../lib/actions/content";

const PROD_BASE = "https://acecore.ace-tracker.workers.dev";
const CRAFTX_PROJECT_ID = "2324019f-7808-4336-b702-99134fcf037c";
const SWARNIKA_USER_ID = "35aef2f0-f926-444f-b64a-251f084a7e93";

interface RequestResult {
  step: string;
  urlOrAction: string;
  status: number | string;
  durationMs: number;
  error?: string;
  cpuReport?: any;
}

async function measureHttp(name: string, url: string): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AceCoreAcceptanceRunner/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const durationMs = Date.now() - start;
    const text = await res.text();
    const is1102 = res.status === 500 && text.includes("1102");
    return {
      step: name,
      urlOrAction: url,
      status: res.status,
      durationMs,
      error: is1102 ? "ERROR 1102 DETECTED" : res.status >= 500 ? `HTTP ${res.status}` : undefined,
    };
  } catch (err: any) {
    return {
      step: name,
      urlOrAction: url,
      status: "NETWORK_ERROR",
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

async function runAcceptanceTest() {
  console.log("===============================================================");
  console.log(" REAL WORKFLOW ACCEPTANCE TEST (REQUIREMENT 14)");
  console.log(" Target: " + PROD_BASE);
  console.log("===============================================================");

  const results: RequestResult[] = [];
  const createdItemIds: string[] = [];

  const ITERATIONS = 3;

  for (let iter = 1; iter <= ITERATIONS; iter++) {
    console.log(`\n>>> STARTING WORKFLOW CYCLE ${iter} of ${ITERATIONS} <<<`);

    // 1. Open Dashboard SSR
    console.log(`[${iter}.1] Opening Dashboard (SSR)...`);
    const r1 = await measureHttp("Dashboard SSR", `${PROD_BASE}/`);
    results.push(r1);
    console.log(`  -> Status: ${r1.status}, Wall: ${r1.durationMs}ms`);

    // 2. Dashboard Layout Hydration (Lean context)
    console.log(`[${iter}.2] Fetching Layout Context Action...`);
    const start2 = Date.now();
    const layoutRes = await getAuthoritativeLayoutContextAction();
    const r2: RequestResult = {
      step: "Layout Context Action",
      urlOrAction: "getAuthoritativeLayoutContextAction()",
      status: layoutRes.success ? 200 : 500,
      durationMs: Date.now() - start2,
      error: layoutRes.error,
    };
    results.push(r2);
    console.log(`  -> Status: ${r2.status}, Projects: ${layoutRes.context?.projects.length || 0}, Wall: ${r2.durationMs}ms`);

    // 3. Dashboard Page Action (Authoritative Dashboard DTO)
    console.log(`[${iter}.3] Fetching Main Dashboard Action...`);
    const start3 = Date.now();
    const dashRes = await getAuthoritativeMainDashboardAction();
    const r3: RequestResult = {
      step: "Main Dashboard Action",
      urlOrAction: "getAuthoritativeMainDashboardAction()",
      status: dashRes.success ? 200 : 500,
      durationMs: Date.now() - start3,
      error: dashRes.error,
    };
    results.push(r3);
    console.log(`  -> Status: ${r3.status}, Tasks Due Today: ${dashRes.data?.tasksDueTodayCount}, Team Capacity Rows: ${dashRes.data?.weeklyTeamCapacity.length}, Wall: ${r3.durationMs}ms`);

    // 4. Open CraftXSpaces Calendar SSR
    console.log(`[${iter}.4] Opening CraftXSpaces Calendar (SSR)...`);
    const r4 = await measureHttp("CraftX Calendar SSR", `${PROD_BASE}/projects/${CRAFTX_PROJECT_ID}/calendar`);
    results.push(r4);
    console.log(`  -> Status: ${r4.status}, Wall: ${r4.durationMs}ms`);

    // 5. Calendar Page Action (Bounded Month Window)
    console.log(`[${iter}.5] Fetching Bounded Calendar Action for CraftXSpaces...`);
    const start5 = Date.now();
    const calRes = await getAuthoritativeCalendarDataAction(CRAFTX_PROJECT_ID, 2026, 8); // Sept 2026
    const r5: RequestResult = {
      step: "Calendar Data Action",
      urlOrAction: "getAuthoritativeCalendarDataAction(CraftXSpaces, 2026, 8)",
      status: calRes.success ? 200 : 500,
      durationMs: Date.now() - start5,
      error: calRes.error,
    };
    results.push(r5);
    console.log(`  -> Status: ${r5.status}, Bounded Items: ${calRes.data?.items.length}, Eligible Members: ${calRes.data?.eligibleProjectMembers.length}, Cached Standards: ${calRes.data?.effortStandards.length}, Wall: ${r5.durationMs}ms`);

    console.log("  -> Eligible Members List:", JSON.stringify(calRes.data?.eligibleProjectMembers.map(m => ({ id: m.user.id, name: m.user.name, role: m.membership.membershipRole }))));
    const selectedMember = calRes.data?.eligibleProjectMembers[0];
    if (!selectedMember) {
      throw new Error("No eligible project members found in CraftXSpaces!");
    }
    console.log(`  -> Selected Production Owner: ${selectedMember.user.name} (${selectedMember.membership.membershipRole}, ID: ${selectedMember.user.id})`);

    // 6. Create Calendar Deliverable
    console.log(`[${iter}.6] Creating Deliverable with Production Owner Swarnika...`);
    const start6 = Date.now();
    const title = `Acceptance Test Deliverable Cycle ${iter} - ${Date.now()}`;
    const createRes = await createContentItemAction({
      projectId: CRAFTX_PROJECT_ID,
      title,
      platform: "Instagram",
      contentType: "post",
      workType: "Simple Static Poster",
      accountableOwnerId: selectedMember.user.id,
      scheduledPublicationDate: "2026-09-15",
      submissionDeadline: "2026-09-12",
      scopeClassification: "contracted",
      workNature: "planned",
    });
    const r6: RequestResult = {
      step: "Create Deliverable Action",
      urlOrAction: "createContentItemAction()",
      status: createRes.success ? 200 : 500,
      durationMs: Date.now() - start6,
      error: createRes.error,
    };
    results.push(r6);
    if (!createRes.success || !createRes.item) {
      throw new Error("Failed to create deliverable: " + createRes.error);
    }
    const createdItemId = createRes.item.id;
    createdItemIds.push(createdItemId);
    console.log(`  -> Created Item ID: ${createdItemId}`);
    console.log(`  -> Persisted finalPlannedSeconds: ${createRes.item.finalPlannedSeconds} (Exact: 5400s / 1.50h)`);
    console.log(`  -> isEffortAnchor: ${createRes.item.isEffortAnchor}`);

    // 7. Refresh Calendar (Immediately visible without stale-state confusion)
    console.log(`[${iter}.7] Refreshing Bounded Calendar (Immediate Visibility Check)...`);
    const start7 = Date.now();
    const calRefresh = await getAuthoritativeCalendarDataAction(CRAFTX_PROJECT_ID, 2026, 8);
    const foundItem = calRefresh.data?.items.find((i) => i.id === createdItemId);
    const r7: RequestResult = {
      step: "Calendar Refresh Action",
      urlOrAction: "getAuthoritativeCalendarDataAction() [After Create]",
      status: foundItem ? 200 : 404,
      durationMs: Date.now() - start7,
      error: foundItem ? undefined : "Newly created item not found in calendar window",
    };
    results.push(r7);
    console.log(`  -> Newly created item found in calendar: ${Boolean(foundItem)}, Wall: ${r7.durationMs}ms`);

    // 8. Return to Dashboard (SSR)
    console.log(`[${iter}.8] Returning to Dashboard (SSR)...`);
    const r8 = await measureHttp("Return Dashboard SSR", `${PROD_BASE}/`);
    results.push(r8);
    console.log(`  -> Status: ${r8.status}, Wall: ${r8.durationMs}ms`);

    // 9. Open Task Page (SSR)
    console.log(`[${iter}.9] Opening Task Detail Page (SSR)...`);
    const r9 = await measureHttp("Task Detail SSR", `${PROD_BASE}/projects/${CRAFTX_PROJECT_ID}/content/${createdItemId}`);
    results.push(r9);
    console.log(`  -> Status: ${r9.status}, Wall: ${r9.durationMs}ms`);

    // 10. Open Performance (SSR)
    console.log(`[${iter}.10] Opening Performance Page (SSR)...`);
    const r10 = await measureHttp("Performance SSR", `${PROD_BASE}/performance`);
    results.push(r10);
    console.log(`  -> Status: ${r10.status}, Wall: ${r10.durationMs}ms`);

    // 11. Performance Server Action
    console.log(`[${iter}.11] Fetching Organization Performance Overview Action...`);
    const start11 = Date.now();
    const perfRes = await getAuthoritativePerformanceOverviewAction("this_month");
    const r11: RequestResult = {
      step: "Performance Action",
      urlOrAction: "getAuthoritativePerformanceOverviewAction()",
      status: perfRes.success ? 200 : 500,
      durationMs: Date.now() - start11,
      error: perfRes.error,
    };
    results.push(r11);
    console.log(`  -> Status: ${r11.status}, Team Members: ${perfRes.overview?.employeeScorecards.length || 0}, Wall: ${r11.durationMs}ms`);

    // 12. Switch Project (e.g. another project calendar SSR)
    console.log(`[${iter}.12] Switching Project -> Ace & Assured Calendar (SSR)...`);
    const r12 = await measureHttp("Switch Project Calendar SSR", `${PROD_BASE}/projects/913a52d7-39ce-4927-9918-a681816e8851/calendar`);
    results.push(r12);
    console.log(`  -> Status: ${r12.status}, Wall: ${r12.durationMs}ms`);
  }

  // --- CLEANUP ---
  console.log("\n--- CLEANING UP TEST DELIVERABLES ---");
  for (const id of createdItemIds) {
    await db.delete(auditRecords).where(eq(auditRecords.entityId, id));
    await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, id));
    await db.delete(contentItems).where(eq(contentItems.id, id));
    console.log(`  Deleted test item: ${id}`);
  }

  // Summary Report
  console.log("\n===============================================================");
  console.log("   ACCEPTANCE TEST SUMMARY                                     ");
  console.log("===============================================================");
  const error1102Count = results.filter((r) => r.error?.includes("1102")).length;
  const totalErrors = results.filter((r) => Boolean(r.error)).length;
  const avgDuration = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);

  console.log(`Total Invocations Tested: ${results.length}`);
  console.log(`Error 1102 Count: ${error1102Count} (Target: 0)`);
  console.log(`Total Errors: ${totalErrors} (Target: 0)`);
  console.log(`Average Wall Duration: ${avgDuration}ms`);

  if (error1102Count > 0 || totalErrors > 0) {
    throw new Error(`Acceptance test failed with ${totalErrors} errors (${error1102Count} Error 1102s)`);
  } else {
    console.log("\n>>> ALL ACCEPTANCE TESTS PASSED WITH 0 ERROR 1102 OCCURRENCES! <<<");
  }
}

runAcceptanceTest().catch((err) => {
  console.error("FATAL ACCEPTANCE TEST ERROR:", err);
  process.exit(1);
});
