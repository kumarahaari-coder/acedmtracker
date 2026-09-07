import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../lib/db";
import {
  users,
  projects,
  projectMemberships,
  contentItems,
  contentAssignments,
} from "../../lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";
import {
  getAuthoritativeLayoutContextAction,
} from "../../lib/actions/workspace";
import {
  getAuthoritativeOrganizationCalendarAction,
  getAuthoritativeCalendarDataAction,
} from "../../lib/actions/calendar";
import {
  getAuthoritativeGlobalApprovalQueueAction,
  getAuthoritativeProjectApprovalQueueAction,
  recordApprovalDecisionAction,
  revokeApprovalDecisionAction,
  recordFounderOverrideAction,
} from "../../lib/actions/approvals";

describe("Authoritative Designer Workspace Restrictions & Identity Isolation", () => {
  let founderUser: any;
  let designerA: any;
  let designerB: any;
  let projectX: any;
  let projectY: any;
  let taskA: any;
  let taskB: any;
  let taskY: any;
  let historicalAssignmentId: string;

  beforeAll(async () => {
    enforceTestSafetyGuard("Designer Workspace Restrictions Test");

    const allUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = allUsers.find((u) => u.organizationRole === "founder");
    const designers = allUsers.filter((u) => u.organizationRole === "designer");

    expect(founderUser).toBeDefined();
    expect(designers.length).toBeGreaterThanOrEqual(1);

    designerA = designers[0];

    // If only one designer in staging DB, create or pick another user as designerB
    if (designers.length >= 2) {
      designerB = designers[1];
    } else {
      const secondUser = allUsers.find((u) => u.id !== designerA.id && u.id !== founderUser.id);
      expect(secondUser).toBeDefined();
      designerB = secondUser;
    }

    const orgId = founderUser.orgId;

    // 1. Create Project X
    const [createdProjX] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        orgId,
        name: `Test Project X - ${Date.now()}`,
        clientName: "Test Client X",
        status: "active",
      })
      .returning();
    projectX = createdProjX;

    // 2. Create Project Y (Designer A will NOT be a member of Project Y)
    const [createdProjY] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        orgId,
        name: `Test Project Y - ${Date.now()}`,
        clientName: "Test Client Y",
        status: "active",
      })
      .returning();
    projectY = createdProjY;

    // 3. Project X memberships: Designer A and Designer B are active members
    await db.insert(projectMemberships).values([
      {
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        userId: designerA.id,
        membershipRole: "designer",
        status: "active",
      },
      {
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        userId: designerB.id,
        membershipRole: "designer",
        status: "active",
      },
      {
        id: crypto.randomUUID(),
        orgId,
        projectId: projectY.id,
        userId: designerB.id,
        membershipRole: "designer",
        status: "active",
      },
    ]);

    // 4. Create Task A in Project X (Assigned to Designer A)
    const [createdTaskA] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        title: `Task A - Designer A Work ${Date.now()}`,
        contentType: "post",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        scheduledPublicationDate: new Date(),
        submissionDeadline: new Date(),
      })
      .returning();
    taskA = createdTaskA;

    await db.insert(contentAssignments).values({
      id: crypto.randomUUID(),
      orgId,
      projectId: projectX.id,
      contentItemId: taskA.id,
      assigneeUserId: designerA.id,
      assignedByUserId: founderUser.id,
      assignmentRole: "designer",
      status: "assigned",
      initialDueAt: new Date(),
      currentDueAt: new Date(),
    });

    // 5. Create Task B in Project X (Assigned to Designer B)
    const [createdTaskB] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        title: `Task B - Designer B Work ${Date.now()}`,
        contentType: "reel",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        scheduledPublicationDate: new Date(),
        submissionDeadline: new Date(),
      })
      .returning();
    taskB = createdTaskB;

    await db.insert(contentAssignments).values({
      id: crypto.randomUUID(),
      orgId,
      projectId: projectX.id,
      contentItemId: taskB.id,
      assigneeUserId: designerB.id,
      assignedByUserId: founderUser.id,
      assignmentRole: "designer",
      status: "assigned",
      initialDueAt: new Date(),
      currentDueAt: new Date(),
    });

    // 6. Create Task Y in Project Y
    const [createdTaskY] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectY.id,
        title: `Task Y - Project Y Work ${Date.now()}`,
        contentType: "carousel",
        workType: "Standard",
        platform: "LinkedIn",
        stage: "draft",
        scheduledPublicationDate: new Date(),
        submissionDeadline: new Date(),
      })
      .returning();
    taskY = createdTaskY;

    await db.insert(contentAssignments).values({
      id: crypto.randomUUID(),
      orgId,
      projectId: projectY.id,
      contentItemId: taskY.id,
      assigneeUserId: designerB.id,
      assignedByUserId: founderUser.id,
      assignmentRole: "designer",
      status: "assigned",
      initialDueAt: new Date(),
      currentDueAt: new Date(),
    });

    // 7. Add a historical reassigned assignment to Task A to test SQL deduplication
    historicalAssignmentId = crypto.randomUUID();
    await db.insert(contentAssignments).values({
      id: historicalAssignmentId,
      orgId,
      projectId: projectX.id,
      contentItemId: taskA.id,
      assigneeUserId: designerB.id,
      assignedByUserId: founderUser.id,
      assignmentRole: "designer",
      status: "reassigned",
      initialDueAt: new Date(),
      currentDueAt: new Date(),
    });
  });

  afterAll(async () => {
    // Cleanup test artifacts
    if (taskA) {
      await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, taskA.id));
      await db.delete(contentItems).where(eq(contentItems.id, taskA.id));
    }
    if (taskB) {
      await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, taskB.id));
      await db.delete(contentItems).where(eq(contentItems.id, taskB.id));
    }
    if (taskY) {
      await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, taskY.id));
      await db.delete(contentItems).where(eq(contentItems.id, taskY.id));
    }
    if (projectX) {
      await db.delete(projectMemberships).where(eq(projectMemberships.projectId, projectX.id));
      await db.delete(projects).where(eq(projects.id, projectX.id));
    }
    if (projectY) {
      await db.delete(projectMemberships).where(eq(projectMemberships.projectId, projectY.id));
      await db.delete(projects).where(eq(projects.id, projectY.id));
    }
  });

  describe("1. Designer A / Designer B Isolation & Calendar Deliverable Scoping", () => {
    it("Designer A sees Project X in layout context and project switcher", async () => {
      const layoutRes = await getAuthoritativeLayoutContextAction(designerA.id);
      expect(layoutRes.success).toBe(true);
      expect(layoutRes.context).toBeDefined();

      const projIds = layoutRes.context!.projects.map((p) => p.id);
      expect(projIds).toContain(projectX.id);
    });

    it("Designer A sees Task A in My Calendar, but NOT Task B", async () => {
      const calRes = await getAuthoritativeOrganizationCalendarAction(designerA.id);
      expect(calRes.success).toBe(true);
      expect(calRes.isDesigner).toBe(true);

      const itemIds = calRes.items.map((i) => i.id);
      expect(itemIds).toContain(taskA.id);
      expect(itemIds).not.toContain(taskB.id);

      // Verify Assigned Owner filter data is self-only
      expect(calRes.teamMembers.length).toBe(1);
      expect(calRes.teamMembers[0].id).toBe(designerA.id);
    });

    it("Designer B sees Task B in My Calendar, but NOT Task A", async () => {
      // Temporarily ensure designerB is treated as designer
      const calRes = await getAuthoritativeOrganizationCalendarAction(designerB.id);
      expect(calRes.success).toBe(true);

      const itemIds = calRes.items.map((i) => i.id);
      expect(itemIds).not.toContain(taskA.id);
      expect(itemIds).toContain(taskB.id);
    });
  });

  describe("2. Unassigned Project Y Isolation", () => {
    it("Designer A does NOT see Project Y in layout context / project switcher", async () => {
      const layoutRes = await getAuthoritativeLayoutContextAction(designerA.id);
      expect(layoutRes.success).toBe(true);
      const projIds = layoutRes.context!.projects.map((p) => p.id);
      expect(projIds).not.toContain(projectY.id);
    });

    it("Designer A does NOT receive Project Y or its deliverables in Calendar", async () => {
      const calRes = await getAuthoritativeOrganizationCalendarAction(designerA.id);
      expect(calRes.success).toBe(true);
      const projIds = calRes.projects.map((p) => p.id);
      expect(projIds).not.toContain(projectY.id);

      const itemIds = calRes.items.map((i) => i.id);
      expect(itemIds).not.toContain(taskY.id);
    });

    it("Designer A is denied direct access to Project Y calendar (403 Forbidden)", async () => {
      const res = await getAuthoritativeCalendarDataAction(projectY.id, 2026, 8, designerA.id);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden|denied|No active membership/i);
    });
  });

  describe("3. Approvals Server-Side Access Rejection (requireApprovalReviewer)", () => {
    it("Designer A is denied Global Approvals Queue (403 Forbidden)", async () => {
      const res = await getAuthoritativeGlobalApprovalQueueAction("all", designerA.id);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/403 Forbidden/i);
    });

    it("Designer A is denied Project Approvals Queue (403 Forbidden)", async () => {
      const res = await getAuthoritativeProjectApprovalQueueAction(projectX.id, "all", designerA.id);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/403 Forbidden/i);
    });

    it("Designer A is denied recording an approval decision (403 Forbidden)", async () => {
      const res = await recordApprovalDecisionAction({
        actorUserId: designerA.id,
        contentItemId: taskA.id,
        submissionVersionId: crypto.randomUUID(),
        component: "creative",
        decision: "approved",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/403 Forbidden/i);
    });

    it("Designer A is denied revoking an approval decision (403 Forbidden)", async () => {
      const res = await revokeApprovalDecisionAction({
        actorUserId: designerA.id,
        decisionId: crypto.randomUUID(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/403 Forbidden/i);
    });

    it("Designer A is denied founder override action", async () => {
      const res = await recordFounderOverrideAction({
        actorUserId: designerA.id,
        contentItemId: taskA.id,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Unauthorized/i);
    });
  });

  describe("4. Revoked Membership Immediate Invalidation", () => {
    it("Revoking Designer A's membership immediately cuts off project access and calendar items", async () => {
      // Revoke membership
      await db
        .update(projectMemberships)
        .set({ status: "revoked" })
        .where(
          and(
            eq(projectMemberships.projectId, projectX.id),
            eq(projectMemberships.userId, designerA.id)
          )
        );

      // 1. Layout context
      const layoutRes = await getAuthoritativeLayoutContextAction(designerA.id);
      expect(layoutRes.success).toBe(true);
      const projIds = layoutRes.context!.projects.map((p) => p.id);
      expect(projIds).not.toContain(projectX.id);

      // 2. Organization Calendar
      const calRes = await getAuthoritativeOrganizationCalendarAction(designerA.id);
      expect(calRes.success).toBe(true);
      const calProjIds = calRes.projects.map((p) => p.id);
      expect(calProjIds).not.toContain(projectX.id);
      const itemIds = calRes.items.map((i) => i.id);
      expect(itemIds).not.toContain(taskA.id);

      // 3. Direct project access
      const directAccess = await getAuthoritativeCalendarDataAction(projectX.id, 2026, 8, designerA.id);
      expect(directAccess.success).toBe(false);
      expect(directAccess.error).toMatch(/Forbidden|denied|No active membership/i);

      // Restore membership for remaining tests
      await db
        .update(projectMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(projectMemberships.projectId, projectX.id),
            eq(projectMemberships.userId, designerA.id)
          )
        );
    });
  });

  describe("5. Calendar Query Deliverable Deduplication", () => {
    it("Task A with historical superseded assignment row appears EXACTLY ONCE in calendar query", async () => {
      const calRes = await getAuthoritativeOrganizationCalendarAction(designerA.id);
      expect(calRes.success).toBe(true);

      const matchingTasks = calRes.items.filter((i) => i.id === taskA.id);
      expect(matchingTasks.length).toBe(1);
    });

    it("Founder calendar also receives Task A EXACTLY ONCE without duplicate rows", async () => {
      const calRes = await getAuthoritativeOrganizationCalendarAction(founderUser.id);
      expect(calRes.success).toBe(true);
      expect(calRes.isDesigner).toBe(false);

      const matchingTasks = calRes.items.filter((i) => i.id === taskA.id);
      expect(matchingTasks.length).toBe(1);
    });
  });

  describe("6. Invariant: Founder & Admin Organization-Wide Scope Remains Intact", () => {
    it("Founder receives organization-wide projects and deliverables", async () => {
      const layoutRes = await getAuthoritativeLayoutContextAction(founderUser.id);
      expect(layoutRes.success).toBe(true);
      const projIds = layoutRes.context!.projects.map((p) => p.id);
      expect(projIds).toContain(projectX.id);
      expect(projIds).toContain(projectY.id);

      const calRes = await getAuthoritativeOrganizationCalendarAction(founderUser.id);
      expect(calRes.success).toBe(true);
      expect(calRes.isDesigner).toBe(false);

      const itemIds = calRes.items.map((i) => i.id);
      expect(itemIds).toContain(taskA.id);
      expect(itemIds).toContain(taskB.id);
      expect(itemIds).toContain(taskY.id);
    });

    it("Founder retains full access to Global and Project Approval queues", async () => {
      const globalRes = await getAuthoritativeGlobalApprovalQueueAction("all", founderUser.id);
      expect(globalRes.error).toBeUndefined();
      expect(globalRes.success).toBe(true);

      const projectRes = await getAuthoritativeProjectApprovalQueueAction(projectX.id, "all", founderUser.id);
      expect(projectRes.error).toBeUndefined();
      expect(projectRes.success).toBe(true);
    });
  });
});
