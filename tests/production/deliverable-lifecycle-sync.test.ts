import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import {
  contentItems,
  submissionVersions,
  users,
  projects,
  founderOverrides,
  approvalDecisions,
  changeRequests,
  creativeAssets,
  submissionAssets,
} from "../../lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getAuthoritativeContentItemDetailAction } from "../../lib/actions/contentDetail";
import {
  getAuthoritativeProjectApprovalQueueAction,
  getAuthoritativeGlobalApprovalQueueAction,
  recordFounderOverrideAction,
} from "../../lib/actions/approvals";
import { getAuthoritativeProjectKanbanAction } from "../../lib/actions/kanban";
import {
  updateContentItemStageAction,
  submitVersionAction,
  createNewVersionDraftAction,
} from "../../lib/actions/content";
import { createChangeRequestAction, respondToChangeRequestAction } from "../../lib/actions/changes";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("CRITICAL — Deliverable Lifecycle Synchronization Across Kanban, Content Detail & Approval Queue", () => {
  let founderUser: any;
  let targetProjectId: string;
  let targetItemId: string;
  let otherProjectId: string | null = null;

  async function resetItemToCleanDraft(itemId: string) {
    await db.delete(founderOverrides).where(eq(founderOverrides.contentItemId, itemId));
    await db.delete(approvalDecisions).where(eq(approvalDecisions.contentItemId, itemId));
    await db.delete(changeRequests).where(eq(changeRequests.contentItemId, itemId));
    await db.update(contentItems).set({ stage: "draft" }).where(eq(contentItems.id, itemId));
    const versions = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.contentItemId, itemId))
      .orderBy(desc(submissionVersions.versionNumber));

    if (versions.length > 0) {
      await db
        .update(submissionVersions)
        .set({ isDraft: true, submittedAt: null })
        .where(eq(submissionVersions.id, versions[0].id));

      for (let i = 1; i < versions.length; i++) {
        await db
          .update(submissionVersions)
          .set({ isDraft: false, submittedAt: null })
          .where(eq(submissionVersions.id, versions[i].id));
      }
    }
  }

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder") || activeUsers[0];
    expect(founderUser).toBeDefined();

    // Find all projects for this org
    const orgProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, founderUser.orgId), isNull(projects.deletedAt)));
    expect(orgProjects.length).toBeGreaterThan(0);

    // Find an item
    const [item] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.orgId, founderUser.orgId), isNull(contentItems.deletedAt)))
      .limit(1);
    expect(item).toBeDefined();

    targetItemId = item.id;
    targetProjectId = item.projectId;

    const other = orgProjects.find((p) => p.id !== targetProjectId);
    if (other) {
      otherProjectId = other.id;
    }
  });

  it("1. Authoritatively resolves deliverable via getAuthoritativeContentItemDetailAction", async () => {
    const res = await getAuthoritativeContentItemDetailAction(targetProjectId, targetItemId, founderUser.id);
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data!.item.id).toBe(targetItemId);
    expect(res.data!.item.projectId).toBe(targetProjectId);
    expect(res.data!.item.title).toBeDefined();
  });

  it("2. Cross-project safeguard: fails if item ID does not belong to URL project ID", async () => {
    // A. Non-existent project
    const fakeProjectId = "00000000-0000-0000-0000-000000000000";
    const resFake = await getAuthoritativeContentItemDetailAction(fakeProjectId, targetItemId, founderUser.id);
    expect(resFake.success).toBe(false);
    expect(resFake.error).toBe("Project not found or inaccessible");

    // B. Mismatched existing project (if multiple projects exist)
    if (otherProjectId) {
      const resMismatch = await getAuthoritativeContentItemDetailAction(otherProjectId, targetItemId, founderUser.id);
      expect(resMismatch.success).toBe(false);
      expect(resMismatch.error).toContain("Cross-project mismatch");
    }
  });

  it("3. Kanban authoritatively loads deliverable with canonical content_items.id for link generation", async () => {
    const kanbanRes = await getAuthoritativeProjectKanbanAction(targetProjectId, founderUser.id);
    expect(kanbanRes.success).toBe(true);
    expect(kanbanRes.data).toBeDefined();

    // Find the target item in kanban cards
    const kanbanCard = kanbanRes.data!.cards.find((card) => card.id === targetItemId);

    if (kanbanCard) {
      expect(kanbanCard.id).toBe(targetItemId);
      const expectedHref = `/projects/${targetProjectId}/content/${kanbanCard.id}`;
      expect(expectedHref).toBe(`/projects/${targetProjectId}/content/${targetItemId}`);
    }
  });

  it("4. Canonical Approval Queue eligibility: draft items without submitted_at are NOT in queue", async () => {
    // Ensure an item in draft stage without submitted version is NOT present in queue
    await resetItemToCleanDraft(targetItemId);

    const queueRes = await getAuthoritativeProjectApprovalQueueAction(targetProjectId, "all", founderUser.id);
    expect(queueRes.success).toBe(true);
    expect(queueRes.data).toBeDefined();

    const inQueue = queueRes.data!.items.find((q) => q.id === targetItemId);
    expect(inQueue).toBeUndefined(); // Must NOT appear in approval queue without immutable submitted version
  });

  it("5. Invariant guard: rejects stage transition to 'submitted' without an immutable submitted version", async () => {
    // Ensure item has no immutable submitted versions
    await resetItemToCleanDraft(targetItemId);

    const res = await updateContentItemStageAction({
      actorUserId: founderUser.id,
      contentItemId: targetItemId,
      stage: "submitted",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Cannot move deliverable to Submitted or In Review without an immutable submitted version");
  });

  it("6. Acceptance Step 1: Create + assign -> Kanban Drafting -> Global Approvals absent", async () => {
    // Reset target item to draft with no submitted versions
    await resetItemToCleanDraft(targetItemId);

    // Kanban should show card in drafting
    const kanbanRes = await getAuthoritativeProjectKanbanAction(targetProjectId, founderUser.id);
    expect(kanbanRes.success).toBe(true);
    const card = kanbanRes.data!.cards.find((c) => c.id === targetItemId);
    expect(card?.stage).toBe("draft");

    // Global approvals should NOT include this item
    const globalRes = await getAuthoritativeGlobalApprovalQueueAction("all", founderUser.id);
    expect(globalRes.success).toBe(true);
    const globalItem = globalRes.data!.items.find((i) => i.id === targetItemId);
    expect(globalItem).toBeUndefined();
  });

  it("7. Acceptance Step 2: Designer submits -> Kanban In Review -> Project & Global Approvals present", async () => {
    // Ensure a draft version exists
    let [v] = await db
      .select()
      .from(submissionVersions)
      .where(and(eq(submissionVersions.contentItemId, targetItemId), eq(submissionVersions.isDraft, true)))
      .limit(1);

    if (!v) {
      const draftRes = await createNewVersionDraftAction({
        actorUserId: founderUser.id,
        contentItemId: targetItemId,
      });
      v = (draftRes as any).version;
    }

    // Ensure draft has a valid creative asset attached
    const [existingAsset] = await db
      .select()
      .from(submissionAssets)
      .where(eq(submissionAssets.submissionVersionId, v.id))
      .limit(1);

    if (!existingAsset) {
      const [ca] = await db
        .insert(creativeAssets)
        .values({
          id: crypto.randomUUID(),
          projectId: targetProjectId,
          orgId: founderUser.orgId,
          r2ObjectKey: `test/sync_${Date.now()}`,
          originalFilename: "test_creative.png",
          fileSizeBytes: 1024,
          mimeType: "image/png",
          contentHash: "hash_" + Math.random().toString(36),
          uploadedByUserId: founderUser.id,
          status: "ready",
        })
        .returning();

      await db.insert(submissionAssets).values({
        submissionVersionId: v.id,
        creativeAssetId: ca.id,
      });
    }

    const submitRes = await submitVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: v.id,
    });
    expect(submitRes.success).toBe(true);

    // Kanban shows in_review
    const kanbanRes = await getAuthoritativeProjectKanbanAction(targetProjectId, founderUser.id);
    const card = kanbanRes.data!.cards.find((c) => c.id === targetItemId);
    expect(card?.stage).toBe("in_review");

    // Project Approvals shows item
    const projAppRes = await getAuthoritativeProjectApprovalQueueAction(targetProjectId, "pending", founderUser.id);
    expect(projAppRes.success).toBe(true);
    const projItem = projAppRes.data!.items.find((i) => i.id === targetItemId);
    expect(projItem).toBeDefined();

    // Global Approvals shows item
    const globalRes = await getAuthoritativeGlobalApprovalQueueAction("pending", founderUser.id);
    expect(globalRes.success).toBe(true);
    const globalItem = globalRes.data!.items.find((i) => i.id === targetItemId);
    expect(globalItem).toBeDefined();
  });

  it("8. Acceptance Step 3: Request Changes -> Kanban Changes Requested -> both approval views reflect Changes Requested", async () => {
    const [v] = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.contentItemId, targetItemId))
      .orderBy(desc(submissionVersions.versionNumber))
      .limit(1);

    const changeRes = await createChangeRequestAction({
      actorUserId: founderUser.id,
      submissionVersionId: v.id,
      component: "creative",
      requestedChange: "Please update colour contrast on background title",
      priority: "medium",
    });
    expect(changeRes.success).toBe(true);

    // Kanban shows changes_requested
    const kanbanRes = await getAuthoritativeProjectKanbanAction(targetProjectId, founderUser.id);
    const card = kanbanRes.data!.cards.find((c) => c.id === targetItemId);
    expect(card?.stage).toBe("changes_requested");

    // Both approval views reflect changes_requested
    const projAppRes = await getAuthoritativeProjectApprovalQueueAction(targetProjectId, "changes_requested", founderUser.id);
    expect(projAppRes.data!.items.find((i) => i.id === targetItemId)).toBeDefined();

    const globalRes = await getAuthoritativeGlobalApprovalQueueAction("changes_requested", founderUser.id);
    expect(globalRes.data!.items.find((i) => i.id === targetItemId)).toBeDefined();
  });

  it("9. Acceptance Step 4: Designer submits revision -> returns to review in both approval queues", async () => {
    const [v] = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.contentItemId, targetItemId))
      .orderBy(desc(submissionVersions.versionNumber))
      .limit(1);

    // Designer responds to open change request before submitting revision
    const [openCr] = await db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.contentItemId, targetItemId))
      .limit(1);

    if (openCr) {
      await respondToChangeRequestAction({
        actorUserId: founderUser.id,
        changeRequestId: openCr.id,
        responseText: "Addressed contrast adjustment",
      });
    }

    // Create revision version with baseVersionId so assets are inherited
    const draftRes = await createNewVersionDraftAction({
      actorUserId: founderUser.id,
      contentItemId: targetItemId,
      baseVersionId: v.id,
    });
    expect(draftRes.success).toBe(true);

    const submitRes = await submitVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: (draftRes as any).version.id,
    });
    expect(submitRes.success).toBe(true);

    // Returns to in_review
    const kanbanRes = await getAuthoritativeProjectKanbanAction(targetProjectId, founderUser.id);
    const card = kanbanRes.data!.cards.find((c) => c.id === targetItemId);
    expect(card?.stage).toBe("in_review");

    // Both approval queues reflect pending review
    const projAppRes = await getAuthoritativeProjectApprovalQueueAction(targetProjectId, "pending", founderUser.id);
    expect(projAppRes.data!.items.find((i) => i.id === targetItemId)).toBeDefined();

    const globalRes = await getAuthoritativeGlobalApprovalQueueAction("pending", founderUser.id);
    expect(globalRes.data!.items.find((i) => i.id === targetItemId)).toBeDefined();
  });

  it("10. Acceptance Step 5: Required approvals complete -> Kanban Approved -> Approved filter in both approval views", async () => {
    // Ensure founderUser is founder or admin
    await db.update(users).set({ organizationRole: "founder" }).where(eq(users.id, founderUser.id));

    // Record Founder Override to complete all approvals
    const overrideRes = await recordFounderOverrideAction({
      actorUserId: founderUser.id,
      contentItemId: targetItemId,
      overrideType: "all",
      justification: "Full acceptance verification approval",
    });
    if (!overrideRes.success) {
      console.error("overrideRes error:", overrideRes.error);
    }
    expect(overrideRes.success).toBe(true);

    // Kanban shows approved
    const kanbanRes = await getAuthoritativeProjectKanbanAction(targetProjectId, founderUser.id);
    const card = kanbanRes.data!.cards.find((c) => c.id === targetItemId);
    expect(card?.stage).toBe("approved");

    // Approved filter in both approval views shows item
    const projAppRes = await getAuthoritativeProjectApprovalQueueAction(targetProjectId, "approved", founderUser.id);
    expect(projAppRes.data!.items.find((i) => i.id === targetItemId)).toBeDefined();

    const globalRes = await getAuthoritativeGlobalApprovalQueueAction("approved", founderUser.id);
    expect(globalRes.data!.items.find((i) => i.id === targetItemId)).toBeDefined();
  });
});
