import fs from "fs";
import path from "path";

// Load .dev.vars safely
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
import {
  contentItems,
  contentGroups,
  contentAssignments,
  submissionVersions,
  submissionAssets,
  creativeAssets,
  auditRecords,
  users,
  projects,
  projectMemberships,
} from "../lib/db/schema";
import { workSessions } from "../lib/db/schema/work-sessions";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createContentItemAction, createContentGroupAction } from "../lib/actions/content";
import { deleteDeliverableAction } from "../lib/actions/deleteDeliverable";
import { getAuthoritativeCalendarDataAction } from "../lib/actions/calendar";
import { getAuthoritativeMainDashboardAction } from "../lib/actions/performance";

const CRAFTX_PROJECT_ID = "2324019f-7808-4336-b702-99134fcf037c"; // CraftXSpaces
const OTHER_PROJECT_ID = "00000000-0000-0000-0000-000000000002"; // Ace & Assured

async function runDeleteDeliverableLifecycleVerification() {
  console.log("===============================================================");
  console.log(" DELETE DELIVERABLE LIFECYCLE VERIFICATION SUITE");
  console.log("===============================================================\n");

  // Fetch test actors
  const allUsers = await db.select().from(users).where(eq(users.status, "active"));
  const founderUser = allUsers.find((u) => u.organizationRole === "founder") || allUsers[0];
  const consultantUser = allUsers.find((u) => u.organizationRole === "consultant") || allUsers[1];

  // Find a designer who is an active member of CRAFTX_PROJECT_ID
  const craftxMembers = await db
    .select({ user: users })
    .from(projectMemberships)
    .innerJoin(users, eq(users.id, projectMemberships.userId))
    .where(
      and(
        eq(projectMemberships.projectId, CRAFTX_PROJECT_ID),
        eq(projectMemberships.status, "active"),
        eq(users.organizationRole, "designer")
      )
    );
  const designerUser = craftxMembers[0]?.user;

  if (!founderUser || !designerUser || !consultantUser) {
    throw new Error("Missing required test users in database");
  }

  console.log(`Founder Actor: ${founderUser.fullName} (${founderUser.id})`);
  console.log(`Designer Actor: ${designerUser.fullName} (${designerUser.id})`);
  console.log(`Consultant Actor: ${consultantUser.fullName} (${consultantUser.id})\n`);

  let testPassed = 0;
  let totalTests = 0;

  function assert(condition: any, testName: string, detail?: string) {
    totalTests++;
    if (Boolean(condition)) {
      testPassed++;
      console.log(`  [PASS] Test ${totalTests}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${testName} ${detail ? `- ${detail}` : ""}`);
      throw new Error(`Assertion failed for Test ${totalTests}: ${testName}`);
    }
  }

  // -------------------------------------------------------------
  // TEST 1 & 2: Accidental Draft -> Hard-Delete (Permanent Removal)
  // -------------------------------------------------------------
  console.log("--- Group 1: Accidental Draft Permanent Hard-Delete ---");
  const draftTitle = `Accidental Draft To Delete - ${Date.now()}`;
  const createRes = await createContentItemAction({
    actorUserId: founderUser.id,
    projectId: CRAFTX_PROJECT_ID,
    title: draftTitle,
    platform: "Instagram",
    contentType: "post",
    workType: "Simple Static Poster",
    accountableOwnerId: designerUser.id,
    scheduledPublicationDate: "2026-09-18",
    submissionDeadline: "2026-09-15",
    scopeClassification: "contracted",
    workNature: "planned",
  });

  assert(createRes.success && !!(createRes as any).item, "Created accidental draft deliverable");
  const draftItemId = (createRes as any).item.id;

  // Perform Delete as Founder
  const deleteRes1 = await deleteDeliverableAction({
    actorUserId: founderUser.id,
    contentItemId: draftItemId,
    reason: "Created accidentally by mistake",
  });

  assert(deleteRes1.success, "Delete action returned success");
  assert(deleteRes1.deletionType === "hard_delete", "Resolved to hard_delete for draft with zero history");

  // Verify completely removed from PostgreSQL
  const [persistedItem] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, draftItemId));
  assert(!persistedItem, "ContentItem row permanently removed from PostgreSQL");

  const assignments = await db
    .select()
    .from(contentAssignments)
    .where(eq(contentAssignments.contentItemId, draftItemId));
  assert(assignments.length === 0, "Dependent ContentAssignment records cleaned (no orphans)");

  const versions = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.contentItemId, draftItemId));
  assert(versions.length === 0, "Dependent SubmissionVersion records cleaned (no orphans)");

  // Verify Audit Record
  const [auditRec1] = await db
    .select()
    .from(auditRecords)
    .where(and(eq(auditRecords.entityId, draftItemId), eq(auditRecords.action, "HARD_DELETE_DELIVERABLE")))
    .orderBy(sql`${auditRecords.timestamp} DESC`)
    .limit(1);
  assert(!!auditRec1, "Audit record logged for HARD_DELETE_DELIVERABLE");
  console.log(`    Audit Summary: ${auditRec1?.summary}\n`);

  // -------------------------------------------------------------
  // TEST 3, 4, 5: Operational History -> Soft-Delete (Archival)
  // -------------------------------------------------------------
  console.log("--- Group 2: Operational History Soft-Delete & View Exclusion ---");
  const historyTitle = `Operational History Deliverable - ${Date.now()}`;
  const createHistoryRes = await createContentItemAction({
    actorUserId: founderUser.id,
    projectId: CRAFTX_PROJECT_ID,
    title: historyTitle,
    platform: "Instagram",
    contentType: "post",
    workType: "Simple Static Poster",
    accountableOwnerId: designerUser.id,
    scheduledPublicationDate: "2026-09-20",
    submissionDeadline: "2026-09-16",
    scopeClassification: "contracted",
    workNature: "planned",
  });

  const historyItemId = (createHistoryRes as any).item.id;

  // Simulate logged work session (3600 seconds)
  await db.insert(workSessions).values({
    projectId: CRAFTX_PROJECT_ID,
    orgId: founderUser.orgId,
    contentItemId: historyItemId,
    assignmentId: (createHistoryRes as any).assignment.id,
    userId: designerUser.id,
    accumulatedSeconds: 3600,
    status: "completed",
    startedAt: new Date(Date.now() - 3600 * 1000),
    endedAt: new Date(),
  });

  // Soft Delete as Founder
  const deleteRes2 = await deleteDeliverableAction({
    actorUserId: founderUser.id,
    contentItemId: historyItemId,
    reason: "Campaign canceled after design work started",
  });

  assert(deleteRes2.success, "Delete action succeeded on operational item");
  assert(deleteRes2.deletionType === "soft_delete", "Resolved to soft_delete due to recorded work session history");

  // Verify Soft-Delete fields in PostgreSQL
  const [softDeletedItem] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, historyItemId));
  assert(!!softDeletedItem, "Row preserved in PostgreSQL");
  assert(softDeletedItem.deletedAt !== null, "deleted_at timestamp is set");
  assert(softDeletedItem.deletedByUserId === founderUser.id, "deleted_by_user_id matches founder");
  assert(softDeletedItem.deletionReason?.includes("Campaign canceled"), "deletion_reason recorded");
  assert(softDeletedItem.status === "archived", "status updated to archived");

  // Verify Work History is Intact
  const [preservedSession] = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.contentItemId, historyItemId));
  assert(!!preservedSession && preservedSession.accumulatedSeconds === 3600, "Historical work session preserved");

  // Verify Disappears from Bounded Calendar
  const calData = await getAuthoritativeCalendarDataAction(CRAFTX_PROJECT_ID, 2026, 8); // Sept 2026
  assert(calData.success, "Fetched bounded calendar data");
  const inCal = calData.data?.items.some((it) => it.id === historyItemId);
  assert(!inCal, "Soft-deleted item disappears from Calendar view");

  // Verify Disappears from Main Dashboard
  const dashData = await getAuthoritativeMainDashboardAction();
  assert(dashData.success, "Fetched main dashboard data");
  const inTodayWorkload = dashData.data?.todaysWorkload.some((q) => q.id === historyItemId);
  assert(!inTodayWorkload, "Soft-deleted item disappears from Dashboard Today Workload");

  // Verify Audit Record
  const [auditRec2] = await db
    .select()
    .from(auditRecords)
    .where(and(eq(auditRecords.entityId, historyItemId), eq(auditRecords.action, "SOFT_DELETE_DELIVERABLE")))
    .orderBy(sql`${auditRecords.timestamp} DESC`)
    .limit(1);
  assert(!!auditRec2, "Audit record logged for SOFT_DELETE_DELIVERABLE");
  console.log(`    Audit Summary: ${auditRec2?.summary}\n`);

  // -------------------------------------------------------------
  // TEST 6 & 7: Authorization Protection (Designer & Cross-Project)
  // -------------------------------------------------------------
  console.log("--- Group 3: Server-Side Authorization Enforcement ---");
  const testProtectedTitle = `Protected Item - ${Date.now()}`;
  const protectedRes = await createContentItemAction({
    actorUserId: founderUser.id,
    projectId: CRAFTX_PROJECT_ID,
    title: testProtectedTitle,
    platform: "Instagram",
    contentType: "post",
    workType: "Simple Static Poster",
    accountableOwnerId: designerUser.id,
    scheduledPublicationDate: "2026-09-22",
    submissionDeadline: "2026-09-18",
  });
  const protectedItemId = (protectedRes as any).item.id;

  // A. Designer attempts deletion -> REJECTED
  const designerAttempt = await deleteDeliverableAction({
    actorUserId: designerUser.id,
    contentItemId: protectedItemId,
  });
  assert(!designerAttempt.success, "Designer cannot delete deliverable");
  assert(designerAttempt.error?.includes("Forbidden"), "Designer received Forbidden error");

  // B. Consultant not assigned to CraftX attempts deletion -> REJECTED
  const consultantAttempt = await deleteDeliverableAction({
    actorUserId: consultantUser.id,
    contentItemId: protectedItemId,
  });
  assert(!consultantAttempt.success, "Consultant not assigned to project cannot delete deliverable");
  assert(consultantAttempt.error?.includes("Forbidden"), "Unassigned consultant received Forbidden error");

  // C. Consultant assigned to CraftX attempts deletion -> PERMITTED
  await db.insert(projectMemberships).values({
    projectId: CRAFTX_PROJECT_ID,
    userId: consultantUser.id,
    orgId: founderUser.orgId,
    membershipRole: "consultant",
    status: "active",
  });

  const assignedConsultantAttempt = await deleteDeliverableAction({
    actorUserId: consultantUser.id,
    contentItemId: protectedItemId,
    reason: "Deleted by assigned project consultant",
  });
  assert(assignedConsultantAttempt.success, "Assigned project consultant can delete deliverable");

  // Remove temporary test membership
  await db
    .delete(projectMemberships)
    .where(
      and(
        eq(projectMemberships.projectId, CRAFTX_PROJECT_ID),
        eq(projectMemberships.userId, consultantUser.id)
      )
    );

  console.log("");

  // -------------------------------------------------------------
  // TEST 8: Multi-Platform ContentGroup Single Sibling Delete + Anchor Transfer
  // -------------------------------------------------------------
  console.log("--- Group 4: Multi-Platform ContentGroup Sibling Delete & Anchor Transfer ---");
  const groupTitle = `Multi-Platform Campaign - ${Date.now()}`;
  const groupRes = await createContentGroupAction({
    actorUserId: founderUser.id,
    projectId: CRAFTX_PROJECT_ID,
    title: groupTitle,
    description: "Multi-platform test campaign",
    workType: "Simple Static Poster",
    platforms: [
      {
        platform: "Instagram",
        contentType: "post",
        scheduledPublicationDate: "2026-09-28",
        submissionDeadline: "2026-09-24",
        accountableOwnerId: designerUser.id,
      },
      {
        platform: "LinkedIn",
        contentType: "post",
        scheduledPublicationDate: "2026-09-28",
        submissionDeadline: "2026-09-24",
        accountableOwnerId: designerUser.id,
      },
      {
        platform: "Facebook",
        contentType: "post",
        scheduledPublicationDate: "2026-09-28",
        submissionDeadline: "2026-09-24",
        accountableOwnerId: designerUser.id,
      },
    ],
  });

  assert(groupRes.success && (groupRes as any).items?.length === 3, "Created 3-platform ContentGroup");
  const groupItems = (groupRes as any).items!;
  const anchorItem = groupItems.find((i: any) => i.isEffortAnchor) || groupItems[0];
  const siblingItems = groupItems.filter((i: any) => i.id !== anchorItem.id);

  console.log(`  Anchor Item: ${anchorItem.title} (${anchorItem.platform}, Planned: ${anchorItem.finalPlannedSeconds}s)`);
  console.log(`  Sibling 1: ${siblingItems[0].platform}, Sibling 2: ${siblingItems[1].platform}`);

  // Delete the anchor item alone (deleteEntireGroup = false)
  const deleteAnchorRes = await deleteDeliverableAction({
    actorUserId: founderUser.id,
    contentItemId: anchorItem.id,
    deleteEntireGroup: false,
    reason: "Instagram cancellation; LinkedIn and Facebook remain",
  });

  assert(deleteAnchorRes.success, "Deleted anchor item successfully");
  assert(!!deleteAnchorRes.anchorTransferredToId, "Anchor transferred to surviving sibling");

  // Verify surviving sibling now holds isEffortAnchor = true and exact planned effort
  const [survivingAnchor] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, deleteAnchorRes.anchorTransferredToId!));

  assert(survivingAnchor.isEffortAnchor === true, "Surviving sibling is now effort anchor");
  assert(
    survivingAnchor.finalPlannedSeconds === anchorItem.finalPlannedSeconds,
    `Planned effort intact: ${survivingAnchor.finalPlannedSeconds}s (was ${anchorItem.finalPlannedSeconds}s)`
  );

  // Verify other sibling is still alive
  const otherSibling = siblingItems.find((s: any) => s.id !== survivingAnchor.id)!;
  const [survivingOther] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, otherSibling.id));
  assert(!!survivingOther && survivingOther.deletedAt === null, "Other sibling remains active");
  console.log("");

  // -------------------------------------------------------------
  // TEST 9: Delete Entire Multi-Platform Group
  // -------------------------------------------------------------
  console.log("--- Group 5: Delete Entire Multi-Platform Group ---");
  const deleteGroupRes = await deleteDeliverableAction({
    actorUserId: founderUser.id,
    contentItemId: survivingAnchor.id,
    deleteEntireGroup: true,
    reason: "Entire multi-platform campaign canceled",
  });

  assert(deleteGroupRes.success, "Delete entire group action succeeded");
  assert(deleteGroupRes.deletedItemIds?.length === 2, "Both surviving siblings were deleted together");

  // Verify all items in group are gone
  const remainingInGroup = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.contentGroupId, anchorItem.contentGroupId!), sql`${contentItems.deletedAt} IS NULL`));
  assert(remainingInGroup.length === 0, "Zero active items remain in content group");

  // Verify audit record for group deletion
  const [groupAudit] = await db
    .select()
    .from(auditRecords)
    .where(eq(auditRecords.entityId, anchorItem.contentGroupId!))
    .orderBy(sql`${auditRecords.timestamp} DESC`)
    .limit(1);
  assert(!!groupAudit, "Audit record logged for group deletion with affected IDs");
  console.log(`    Group Audit Summary: ${groupAudit?.summary}\n`);

  // -------------------------------------------------------------
  // Clean-up of test soft-deleted records to keep DB tidy
  // -------------------------------------------------------------
  await db.delete(workSessions).where(eq(workSessions.contentItemId, historyItemId));
  await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, historyItemId));
  await db.delete(contentItems).where(eq(contentItems.id, historyItemId));

  console.log("===============================================================");
  console.log(` ALL ${totalTests} TESTS PASSED CLEANLY (100% SUCCESS)`);
  console.log("===============================================================");
}

runDeleteDeliverableLifecycleVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
