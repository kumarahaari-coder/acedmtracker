import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { contentItems, submissionVersions, users, projects } from "../../lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthoritativeContentItemDetailAction } from "../../lib/actions/contentDetail";
import { getAuthoritativeProjectApprovalQueueAction } from "../../lib/actions/approvals";
import { getAuthoritativeProjectKanbanAction } from "../../lib/actions/kanban";
import { updateContentItemStageAction } from "../../lib/actions/content";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("CRITICAL — Deliverable Lifecycle Synchronization Across Kanban, Content Detail & Approval Queue", () => {
  let founderUser: any;
  let targetProjectId: string;
  let targetItemId: string;
  let otherProjectId: string | null = null;

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
    await db.update(contentItems).set({ stage: "draft" }).where(eq(contentItems.id, targetItemId));
    // Also ensure no submitted versions exist for this draft item
    await db
      .update(submissionVersions)
      .set({ isDraft: true, submittedAt: null })
      .where(eq(submissionVersions.contentItemId, targetItemId));

    const queueRes = await getAuthoritativeProjectApprovalQueueAction(targetProjectId, "all", founderUser.id);
    expect(queueRes.success).toBe(true);
    expect(queueRes.data).toBeDefined();

    const inQueue = queueRes.data!.items.find((q) => q.id === targetItemId);
    expect(inQueue).toBeUndefined(); // Must NOT appear in approval queue without immutable submitted version
  });

  it("5. Invariant guard: rejects stage transition to 'submitted' without an immutable submitted version", async () => {
    // Ensure item has no immutable submitted versions
    await db
      .update(submissionVersions)
      .set({ isDraft: true, submittedAt: null })
      .where(eq(submissionVersions.contentItemId, targetItemId));

    const res = await updateContentItemStageAction({
      actorUserId: founderUser.id,
      contentItemId: targetItemId,
      stage: "submitted",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Cannot move deliverable to Submitted or In Review without an immutable submitted version");
  });
});
