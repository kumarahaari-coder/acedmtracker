import { describe, it, expect, beforeAll } from "vitest";
import { db, runTransaction } from "../../lib/db";
import { contentItems, contentAssignments, users, projects, projectMemberships } from "../../lib/db/schema";
import { assignContentItemAction } from "../../lib/actions/assignments";
import { getAuthoritativeWorkspaceStateAction } from "../../lib/actions/workspace";
import { eq, and } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("Assignment Lifecycle & Database Invariant Persistence", () => {
  let founderUser: any;
  let designerUserA: any;
  let designerUserB: any;
  let testProject: any;
  let testItem: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    // 1. Fetch active founder and 2 active designers
    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder");
    const designers = activeUsers.filter((u) => u.organizationRole === "designer");

    expect(founderUser).toBeDefined();
    expect(designers.length).toBeGreaterThanOrEqual(1);

    designerUserA = designers[0];
    designerUserB = designers[1] || founderUser; // Fallback to founder if single designer in test DB

    // 2. Fetch active project
    const [proj] = await db.select().from(projects).where(eq(projects.orgId, founderUser.orgId)).limit(1);
    expect(proj).toBeDefined();
    testProject = proj;

    // 3. Ensure memberships exist
    const ensureMembership = async (userId: string) => {
      const [existing] = await db
        .select()
        .from(projectMemberships)
        .where(and(eq(projectMemberships.projectId, testProject.id), eq(projectMemberships.userId, userId)));
      if (!existing) {
        await db.insert(projectMemberships).values({
          projectId: testProject.id,
          orgId: testProject.orgId,
          userId,
          membershipRole: "designer",
          status: "active",
        });
      }
    };

    await ensureMembership(designerUserA.id);
    if (designerUserB.id !== designerUserA.id) {
      await ensureMembership(designerUserB.id);
    }

    // 4. Insert or fetch a test content item
    const [item] = await db.select().from(contentItems).where(eq(contentItems.projectId, testProject.id)).limit(1);
    if (item) {
      testItem = item;
    } else {
      const [newItem] = await db
        .insert(contentItems)
        .values({
          projectId: testProject.id,
          orgId: testProject.orgId,
          title: "Test Assignment Deliverable",
          platform: "Instagram",
          contentType: "post",
          stage: "draft",
        })
        .returning();
      testItem = newItem;
    }
  });

  it("1. Assign User A -> DB commit -> content_assignments is canonical active assignment", async () => {
    const res = await assignContentItemAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      contentItemId: testItem.id,
      assigneeUserId: designerUserA.id,
      assignmentRole: "designer",
      reason: "Initial assignment to User A",
    });

    expect(res.success).toBe(true);
    if (!res.success || !("assignment" in res)) return;

    expect(res.assignment).toBeDefined();
    expect(res.assignment?.assigneeUserId).toBe(designerUserA.id);

    // Verify canonical content_assignments row
    const [activeAssignment] = await db
      .select()
      .from(contentAssignments)
      .where(
        and(
          eq(contentAssignments.contentItemId, testItem.id),
          eq(contentAssignments.status, "assigned")
        )
      );

    expect(activeAssignment).toBeDefined();
    expect(activeAssignment.assigneeUserId).toBe(designerUserA.id);
  });

  it("2. Workspace hydration returns User A as accountableOwnerId and contentAssignment", async () => {
    const ws = await getAuthoritativeWorkspaceStateAction(founderUser.id);
    expect(ws.success).toBe(true);

    const hydratedItem = ws.state.contentItems.find((i) => i.id === testItem.id);
    expect(hydratedItem).toBeDefined();
    expect(hydratedItem?.accountableOwnerId).toBe(designerUserA.id);

    const hydratedAssignment = ws.state.contentAssignments.find(
      (a) => a.contentItemId === testItem.id && a.status === "assigned"
    );
    expect(hydratedAssignment).toBeDefined();
    expect(hydratedAssignment?.assigneeUserId).toBe(designerUserA.id);
  });

  it("3. Reassign to User B -> previous revoked to 'reassigned', new 'assigned' created", async () => {
    if (designerUserA.id === designerUserB.id) return; // Skip if single user in test environment

    const res = await assignContentItemAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      contentItemId: testItem.id,
      assigneeUserId: designerUserB.id,
      assignmentRole: "designer",
      reason: "Reassigned from A to B",
    });

    expect(res.success).toBe(true);
    if (!res.success || !("assignment" in res)) return;

    expect(res.reassigned).toBe(true);
    expect(res.assignment?.assigneeUserId).toBe(designerUserB.id);

    // Verify User A assignment is now 'reassigned'
    const assignments = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.contentItemId, testItem.id));

    const userAAssignment = assignments.find((a) => a.assigneeUserId === designerUserA.id);
    expect(userAAssignment?.status).toBe("reassigned");

    const userBAssignment = assignments.find((a) => a.assigneeUserId === designerUserB.id && a.status === "assigned");
    expect(userBAssignment).toBeDefined();
  });

  it("4. Re-hydration verifies User B remains active and User A is no longer active assignee", async () => {
    if (designerUserA.id === designerUserB.id) return;

    const ws = await getAuthoritativeWorkspaceStateAction(founderUser.id);
    expect(ws.success).toBe(true);

    const hydratedItem = ws.state.contentItems.find((i) => i.id === testItem.id);
    expect(hydratedItem?.accountableOwnerId).toBe(designerUserB.id);

    const activeAssignments = ws.state.contentAssignments.filter(
      (a) => a.contentItemId === testItem.id && a.status === "assigned"
    );
    expect(activeAssignments.length).toBe(1);
    expect(activeAssignments[0].assigneeUserId).toBe(designerUserB.id);
  });
});
