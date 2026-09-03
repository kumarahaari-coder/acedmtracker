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
import { users, contentItems } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthoritativeLayoutContextAction } from "../lib/actions/workspace";
import { getAuthoritativeMainDashboardAction } from "../lib/actions/performance";
import { getAuthoritativeCalendarDataAction } from "../lib/actions/calendar";
import { getAuthoritativeProjectKanbanAction } from "../lib/actions/kanban";
import { createContentItemAction, updateContentItemStageAction } from "../lib/actions/content";
import { deleteDeliverableAction } from "../lib/actions/deleteDeliverable";

const PROD_BASE = "https://acecore.ace-tracker.workers.dev";
const SWARNIKA_PROJECT_ID = "d4627daa-9c06-428b-8d65-784c94c2e3c5";

interface TestStepResult {
  step: string;
  status: number | string;
  durationMs: number;
  is1102: boolean;
  details?: string;
}

const results: TestStepResult[] = [];

async function measureHttp(name: string, url: string): Promise<TestStepResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "KanbanAcceptanceRunner/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const durationMs = Date.now() - start;
    const text = await res.text();
    const is1102 = res.status === 500 && text.includes("1102");
    const result = {
      step: name,
      status: res.status,
      durationMs,
      is1102,
      details: is1102 ? "ERROR 1102 DETECTED!" : `HTTP ${res.status}`,
    };
    results.push(result);
    return result;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const result = {
      step: name,
      status: "NETWORK_ERR",
      durationMs,
      is1102: false,
      details: err.message,
    };
    results.push(result);
    return result;
  }
}

async function runReproduction() {
  console.log("===============================================================");
  console.log(" REAL KANBAN REPRODUCTION & ACCEPTANCE TEST");
  console.log(` Target: ${PROD_BASE}`);
  console.log(` Project: Swarnika (${SWARNIKA_PROJECT_ID})`);
  console.log("===============================================================\n");

  const [founder] = await db.select().from(users).where(eq(users.organizationRole, "founder")).limit(1);
  if (!founder) throw new Error("Founder user not found");

  const [swarnikaMember] = await db.select().from(users).where(eq(users.email, "swarnika@aceassured.com")).limit(1);
  const assigneeId = swarnikaMember?.id || founder.id;

  const CYCLES = 3;
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    console.log(`>>> STARTING REPRODUCTION CYCLE ${cycle} of ${CYCLES} <<<`);

    // 1. Login normally (Layout SSR + Context)
    console.log(`[${cycle}.1] Opening Dashboard (SSR)...`);
    const r1 = await measureHttp(`Cycle ${cycle}: Dashboard SSR`, `${PROD_BASE}/`);
    console.log(`  -> Status: ${r1.status}, Wall: ${r1.durationMs}ms`);

    const tLayout = Date.now();
    const layoutRes = await getAuthoritativeLayoutContextAction();
    console.log(`  -> Layout Action: Success=${layoutRes.success}, Projects=${layoutRes.context?.projects.length}, Wall: ${Date.now() - tLayout}ms`);

    // 2. Open Swarnika Project Page
    console.log(`[${cycle}.2] Opening Swarnika Overview (SSR)...`);
    const r2 = await measureHttp(`Cycle ${cycle}: Swarnika Overview SSR`, `${PROD_BASE}/projects/${SWARNIKA_PROJECT_ID}`);
    console.log(`  -> Status: ${r2.status}, Wall: ${r2.durationMs}ms`);

    // 3. Open Calendar
    console.log(`[${cycle}.3] Opening Calendar (SSR)...`);
    const r3 = await measureHttp(`Cycle ${cycle}: Calendar SSR`, `${PROD_BASE}/projects/${SWARNIKA_PROJECT_ID}/calendar`);
    console.log(`  -> Status: ${r3.status}, Wall: ${r3.durationMs}ms`);

    const tCal = Date.now();
    const calRes = await getAuthoritativeCalendarDataAction(SWARNIKA_PROJECT_ID, 2026, 9);
    console.log(`  -> Calendar Action: Success=${calRes.success}, Items=${calRes.data?.items.length}, Wall: ${Date.now() - tCal}ms`);

    // 4. Open Kanban
    console.log(`[${cycle}.4] Opening Kanban (SSR)...`);
    const r4 = await measureHttp(`Cycle ${cycle}: Kanban SSR`, `${PROD_BASE}/projects/${SWARNIKA_PROJECT_ID}/kanban`);
    console.log(`  -> Status: ${r4.status}, Wall: ${r4.durationMs}ms`);

    const tKanban = Date.now();
    const kanbanRes = await getAuthoritativeProjectKanbanAction(SWARNIKA_PROJECT_ID);
    console.log(`  -> Kanban Action: Success=${kanbanRes.success}, Cards=${kanbanRes.data?.cards.length}, Columns=${kanbanRes.data?.columns.length}, Wall: ${Date.now() - tKanban}ms`);

    // 5. Refresh Kanban directly
    console.log(`[${cycle}.5] Refreshing Kanban directly (SSR)...`);
    const r5 = await measureHttp(`Cycle ${cycle}: Kanban Refresh SSR`, `${PROD_BASE}/projects/${SWARNIKA_PROJECT_ID}/kanban`);
    console.log(`  -> Status: ${r5.status}, Wall: ${r5.durationMs}ms`);

    const tKanbanRef = Date.now();
    const kanbanRefRes = await getAuthoritativeProjectKanbanAction(SWARNIKA_PROJECT_ID);
    console.log(`  -> Kanban Direct Action: Success=${kanbanRefRes.success}, Cards=${kanbanRefRes.data?.cards.length}, Wall: ${Date.now() - tKanbanRef}ms`);

    // 6. Create Deliverable & Move between Kanban columns
    console.log(`[${cycle}.6] Creating Deliverable & Moving across Kanban columns...`);
    const createRes = await createContentItemAction({
      actorUserId: founder.id,
      projectId: SWARNIKA_PROJECT_ID,
      title: `Kanban Flow Test Deliverable C${cycle} - ${Date.now()}`,
      platform: "Instagram",
      contentType: "post",
      workType: "Simple Static Poster",
      accountableOwnerId: assigneeId,
      submissionDeadline: "2026-09-20T00:00:00.000Z",
      scheduledPublicationDate: "2026-09-25T00:00:00.000Z",
    });
    if (!createRes.success || !("item" in createRes) || !createRes.item) {
      throw new Error(`Failed to create test item: ${(createRes as any).error}`);
    }
    const testItemId = (createRes as any).item.id;
    console.log(`  -> Created Item ID: ${testItemId}`);

    // Move to submitted
    const tMove1 = Date.now();
    const move1 = await updateContentItemStageAction({
      actorUserId: founder.id,
      contentItemId: testItemId,
      stage: "submitted",
      reason: "Moving from draft to submitted in Kanban",
    });
    console.log(`  -> Move stage -> submitted: Success=${move1.success}, Wall: ${Date.now() - tMove1}ms`);

    // Move to in_review
    const tMove2 = Date.now();
    const move2 = await updateContentItemStageAction({
      actorUserId: founder.id,
      contentItemId: testItemId,
      stage: "in_review",
      reason: "Moving from submitted to in_review in Kanban",
    });
    console.log(`  -> Move stage -> in_review: Success=${move2.success}, Wall: ${Date.now() - tMove2}ms`);

    // 7. Open Deliverable Detail Page
    console.log(`[${cycle}.7] Opening Deliverable Detail (SSR)...`);
    const r7 = await measureHttp(`Cycle ${cycle}: Deliverable Detail SSR`, `${PROD_BASE}/projects/${SWARNIKA_PROJECT_ID}/content/${testItemId}`);
    console.log(`  -> Status: ${r7.status}, Wall: ${r7.durationMs}ms`);

    // 8. Return to Kanban
    console.log(`[${cycle}.8] Returning to Kanban (SSR + Action)...`);
    const r8 = await measureHttp(`Cycle ${cycle}: Return to Kanban SSR`, `${PROD_BASE}/projects/${SWARNIKA_PROJECT_ID}/kanban`);
    console.log(`  -> Status: ${r8.status}, Wall: ${r8.durationMs}ms`);

    const tKanbanBack = Date.now();
    const kanbanBack = await getAuthoritativeProjectKanbanAction(SWARNIKA_PROJECT_ID);
    const foundCard = kanbanBack.data?.cards.find((c) => c.id === testItemId);
    console.log(`  -> Verified Card in Kanban: Found=${!!foundCard}, CurrentStage=${foundCard?.stage}, Wall: ${Date.now() - tKanbanBack}ms`);

    // 9. Open Delete Deliverable & Cleanup
    console.log(`[${cycle}.9] Cleaning up test deliverable...`);
    const delRes = await deleteDeliverableAction({
      actorUserId: founder.id,
      contentItemId: testItemId,
      deleteEntireGroup: false,
      reason: "Acceptance test automated cleanup",
    });
    console.log(`  -> Delete Deliverable: Success=${delRes.success}, DeletionType=${delRes.deletionType}`);

    // 10. Return to Dashboard
    console.log(`[${cycle}.10] Returning to Dashboard (SSR + Action)...`);
    const r10 = await measureHttp(`Cycle ${cycle}: Return Dashboard SSR`, `${PROD_BASE}/`);
    console.log(`  -> Status: ${r10.status}, Wall: ${r10.durationMs}ms`);

    const tDash = Date.now();
    const dashRes = await getAuthoritativeMainDashboardAction();
    console.log(`  -> Main Dashboard Action: Success=${dashRes.success}, TasksDueToday=${dashRes.data?.tasksDueTodayCount}, Wall: ${Date.now() - tDash}ms\n`);
  }

  // Summary
  const count1102 = results.filter((r) => r.is1102).length;
  const avgDuration = Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length);

  console.log("===============================================================");
  console.log("   KANBAN ACCEPTANCE TEST SUMMARY                             ");
  console.log("===============================================================");
  console.log(`Total HTTP Invocations Tested: ${results.length}`);
  console.log(`Error 1102 Count: ${count1102} (Target: 0)`);
  console.log(`Average HTTP Wall Duration: ${avgDuration}ms`);

  if (count1102 === 0) {
    console.log("\n>>> ALL KANBAN ACCEPTANCE TESTS PASSED WITH 0 ERROR 1102 OCCURRENCES! <<<");
  } else {
    console.error("\n>>> FAILED: ERROR 1102 DETECTED! <<<");
    process.exit(1);
  }
}

runReproduction().catch((err) => {
  console.error("FATAL acceptance error:", err);
  process.exit(1);
});
