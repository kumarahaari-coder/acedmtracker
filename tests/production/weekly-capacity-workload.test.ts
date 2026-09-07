import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { users, projects, contentItems, contentAssignments } from "../../lib/db/schema";
import { calculateEmployeeScorecard, getTaskPlannedHours, getISTDateString, getPeriodDateRange } from "../../lib/calculations/operationalEngine";
import { assignContentItemAction } from "../../lib/actions/assignments";
import { eq, and } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("TEST C & D — Weekly Team Capacity & Planned Effort Precedence", () => {
  let founderUser: any;
  let designerUser1: any;
  let designerUser2: any;
  let testProject: any;
  let testItem: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder") || activeUsers[0];
    const designers = activeUsers.filter((u) => u.organizationRole === "designer" || u.organizationRole === "consultant");
    designerUser1 = designers[0] || activeUsers[0];
    designerUser2 = designers[1] || activeUsers[1] || activeUsers[0];

    const [proj] = await db.select().from(projects).where(eq(projects.orgId, founderUser.orgId)).limit(1);
    testProject = proj;

    const [item] = await db.select().from(contentItems).where(eq(contentItems.projectId, testProject.id)).limit(1);
    testItem = item;
    if (!testItem.finalPlannedSeconds && !testItem.standardContentSeconds) {
      await db.update(contentItems).set({ finalPlannedSeconds: 11700 }).where(eq(contentItems.id, testItem.id));
      testItem.finalPlannedSeconds = 11700;
    }

    // Ensure project memberships
    const { projectMemberships } = await import("../../lib/db/schema");
    const m1 = await db.select().from(projectMemberships).where(and(eq(projectMemberships.projectId, testProject.id), eq(projectMemberships.userId, designerUser1.id)));
    if (m1.length === 0) {
      await db.insert(projectMemberships).values({
        projectId: testProject.id,
        orgId: testProject.orgId,
        userId: designerUser1.id,
        membershipRole: "designer",
        assignedByUserId: founderUser.id,
        status: "active",
      });
    } else if (m1[0].status !== "active") {
      await db.update(projectMemberships).set({ status: "active" }).where(eq(projectMemberships.id, m1[0].id));
    }

    const m2 = await db.select().from(projectMemberships).where(and(eq(projectMemberships.projectId, testProject.id), eq(projectMemberships.userId, designerUser2.id)));
    if (m2.length === 0) {
      await db.insert(projectMemberships).values({
        projectId: testProject.id,
        orgId: testProject.orgId,
        userId: designerUser2.id,
        membershipRole: "designer",
        assignedByUserId: founderUser.id,
        status: "active",
      });
    } else if (m2[0].status !== "active") {
      await db.update(projectMemberships).set({ status: "active" }).where(eq(projectMemberships.id, m2[0].id));
    }
  });

  it("1. Planned effort precedence follows deliverable snapshot -> effort standard -> fallback", () => {
    // A. Deliverable snapshot
    const itemWithSnapshot = {
      ...testItem,
      finalPlannedSeconds: 11700, // 3.25h
    };
    expect(getTaskPlannedHours(itemWithSnapshot as any)).toBe(3.25);

    // B. Work type explicitly referenced
    const itemWithWorkType = {
      ...testItem,
      finalPlannedSeconds: undefined,
      standardContentSeconds: 0,
      standardProductionSeconds: 0,
      workType: "Carousel (3.25h)",
    };
    expect(getTaskPlannedHours(itemWithWorkType as any)).toBe(3.25);

    // C. Legacy fallback
    const itemLegacy = {
      ...testItem,
      finalPlannedSeconds: undefined,
      standardContentSeconds: 0,
      standardProductionSeconds: 0,
      workType: undefined,
      contentType: "carousel",
    };
    expect(getTaskPlannedHours(itemLegacy as any)).toBe(3.25);
  });

  it("2. Operational date rule: internal due date determines current week capacity inclusion", async () => {
    const period = getPeriodDateRange("this_week");
    const todayIST = getISTDateString(new Date());

    // Assign deliverable to designerUser1 with due date todayIST inside current week
    const assignRes = await assignContentItemAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      assigneeUserId: designerUser1.id,
      dueAt: todayIST + "T18:00:00.000Z",
      reason: "Capacity test assignment",
    });

    expect(assignRes.success).toBe(true);

    // Fetch active assignments and content items
    const allAssignments = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.orgId, founderUser.orgId));
    const allItems = await db.select().from(contentItems).where(eq(contentItems.orgId, founderUser.orgId));

    const mappedAssignments: any[] = allAssignments.map((a) => ({
      id: a.id,
      contentItemId: a.contentItemId,
      assigneeUserId: a.assigneeUserId,
      status: a.status,
      currentDueAt: a.currentDueAt.toISOString(),
      initialDueAt: a.initialDueAt.toISOString(),
    }));

    const mappedItems: any[] = allItems.map((i) => ({
      id: i.id,
      projectId: i.projectId,
      title: i.title,
      contentType: i.contentType,
      workType: i.workType,
      standardContentSeconds: i.standardContentSeconds,
      standardProductionSeconds: i.standardProductionSeconds,
      stage: i.stage,
      finalPlannedSeconds: (i as any).finalPlannedSeconds || undefined,
      deadlines: {
        submissionDeadline: i.submissionDeadline ? i.submissionDeadline.toISOString() : undefined,
        scheduledPublicationDate: i.scheduledPublicationDate ? i.scheduledPublicationDate.toISOString() : undefined,
      },
    }));

    const scorecard1 = calculateEmployeeScorecard(
      {
        id: designerUser1.id,
        name: designerUser1.fullName,
        email: designerUser1.email,
        role: designerUser1.organizationRole,
        status: "active",
      } as any,
      period,
      mappedItems,
      mappedAssignments,
      [],
      [],
      [],
      []
    );

    expect(scorecard1.assignedPlannedHours).toBeGreaterThan(0);

    // Reassign task to designerUser2
    const reassignRes = await assignContentItemAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      assigneeUserId: designerUser2.id,
      dueAt: todayIST + "T18:00:00.000Z",
      reason: "Reassign to designerUser2",
    });

    expect(reassignRes.success).toBe(true);

    const updatedAssignments = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.orgId, founderUser.orgId));
    const mappedUpdatedAssignments: any[] = updatedAssignments.map((a) => ({
      id: a.id,
      contentItemId: a.contentItemId,
      assigneeUserId: a.assigneeUserId,
      status: a.status,
      currentDueAt: a.currentDueAt.toISOString(),
      initialDueAt: a.initialDueAt.toISOString(),
    }));

    // Recalculate scorecard for designerUser1 -> workload should decrease
    const scorecard1After = calculateEmployeeScorecard(
      {
        id: designerUser1.id,
        name: designerUser1.fullName,
        email: designerUser1.email,
        role: designerUser1.organizationRole,
        status: "active",
      } as any,
      period,
      mappedItems,
      mappedUpdatedAssignments,
      [],
      [],
      [],
      []
    );

    // Recalculate scorecard for designerUser2 -> workload should increase
    const scorecard2After = calculateEmployeeScorecard(
      {
        id: designerUser2.id,
        name: designerUser2.fullName,
        email: designerUser2.email,
        role: designerUser2.organizationRole,
        status: "active",
      } as any,
      period,
      mappedItems,
      mappedUpdatedAssignments,
      [],
      [],
      [],
      []
    );

    expect(scorecard1After.assignedPlannedHours).toBe(0);
    expect(scorecard2After.assignedPlannedHours).toBeGreaterThan(0);
  });
});
