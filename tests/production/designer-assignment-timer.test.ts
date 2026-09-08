import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../lib/db";
import {
  users,
  projects,
  projectMemberships,
  contentItems,
  contentAssignments,
  workSessions,
} from "../../lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";
import {
  startWorkSessionAction,
  pauseWorkSessionAction,
  resumeWorkSessionAction,
  stopWorkSessionAction,
} from "../../lib/actions/timers";
import { getAuthoritativeContentItemDetailAction } from "../../lib/actions/contentDetail";
import { getAuthoritativeOrganizationCalendarAction } from "../../lib/actions/calendar";
import { getAuthoritativeMainDashboardAction } from "../../lib/actions/performance";
import fs from "fs";
import path from "path";

describe("Production Regression Test Suite: Designer Assignment & Timer Architecture", () => {
  let founderUser: any;
  let designerA: any;
  let designerB: any;
  let projectX: any;
  let projectNoMembership: any;
  let taskA: any;
  let taskB: any;
  let taskHistoricalAccepted: any;
  let taskReassigned: any;
  let assignmentA: any;
  let assignmentB: any;
  let assignmentHistorical: any;
  let assignmentReassigned: any;
  let activeSessionA: any;

  beforeAll(async () => {
    enforceTestSafetyGuard("Designer Assignment Timer Suite");

    const allUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = allUsers.find((u) => u.organizationRole === "founder");
    const designers = allUsers.filter((u) => u.organizationRole === "designer");

    expect(founderUser).toBeDefined();
    expect(designers.length).toBeGreaterThanOrEqual(1);

    designerA = designers[0];
    if (designers.length >= 2) {
      designerB = designers[1];
    } else {
      const secondUser = allUsers.find((u) => u.id !== designerA.id);
      expect(secondUser).toBeDefined();
      designerB = secondUser;
    }

    const orgId = founderUser.orgId;
    const now = new Date();

    // 1. Create Project X
    const [projX] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        orgId,
        name: `Timer Suite Project X - ${Date.now()}`,
        clientName: "Client X",
        status: "active",
      })
      .returning();
    projectX = projX;

    // 2. Create Project with NO membership for Designer A
    const [projNoMember] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        orgId,
        name: `Timer Suite Project NoMember - ${Date.now()}`,
        clientName: "Client NoMember",
        status: "active",
      })
      .returning();
    projectNoMembership = projNoMember;

    // 3. Project memberships
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
      // Designer B is member of projectNoMembership, Designer A is NOT
      {
        id: crypto.randomUUID(),
        orgId,
        projectId: projectNoMembership.id,
        userId: designerB.id,
        membershipRole: "designer",
        status: "active",
      },
    ]);

    // 4. Create Task A (Assigned to Designer A with status = 'assigned')
    const [tA] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        title: `Task A Assigned Directly - ${Date.now()}`,
        contentType: "post",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        finalInternalDeadline: now,
        submissionDeadline: now,
        finalPlannedSeconds: 3600,
      })
      .returning();
    taskA = tA;

    const [asgnA] = await db
      .insert(contentAssignments)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        contentItemId: taskA.id,
        assigneeUserId: designerA.id,
        assignedByUserId: founderUser.id,
        assignmentRole: "designer",
        status: "assigned",
        initialDueAt: now,
        currentDueAt: now,
      })
      .returning();
    assignmentA = asgnA;

    // 5. Create Task B (Assigned to Designer B)
    const [tB] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        title: `Task B Designer B Work - ${Date.now()}`,
        contentType: "post",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        finalInternalDeadline: now,
        submissionDeadline: now,
        finalPlannedSeconds: 3600,
      })
      .returning();
    taskB = tB;

    const [asgnB] = await db
      .insert(contentAssignments)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        contentItemId: taskB.id,
        assigneeUserId: designerB.id,
        assignedByUserId: founderUser.id,
        assignmentRole: "designer",
        status: "assigned",
        initialDueAt: now,
        currentDueAt: now,
      })
      .returning();
    assignmentB = asgnB;

    // 6. Create Task Historical Accepted (status = 'accepted')
    const [tHist] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        title: `Task Historical Accepted - ${Date.now()}`,
        contentType: "post",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        finalInternalDeadline: now,
        submissionDeadline: now,
        finalPlannedSeconds: 3600,
      })
      .returning();
    taskHistoricalAccepted = tHist;

    const [asgnHist] = await db
      .insert(contentAssignments)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        contentItemId: taskHistoricalAccepted.id,
        assigneeUserId: designerA.id,
        assignedByUserId: founderUser.id,
        assignmentRole: "designer",
        status: "accepted",
        acceptedAt: now,
        initialDueAt: now,
        currentDueAt: now,
      })
      .returning();
    assignmentHistorical = asgnHist;

    // 7. Create Task Reassigned (status = 'reassigned')
    const [tReasgn] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        title: `Task Reassigned - ${Date.now()}`,
        contentType: "post",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        finalInternalDeadline: now,
        submissionDeadline: now,
      })
      .returning();
    taskReassigned = tReasgn;

    const [asgnReasgn] = await db
      .insert(contentAssignments)
      .values({
        id: crypto.randomUUID(),
        orgId,
        projectId: projectX.id,
        contentItemId: taskReassigned.id,
        assigneeUserId: designerA.id,
        assignedByUserId: founderUser.id,
        assignmentRole: "designer",
        status: "reassigned",
        initialDueAt: now,
        currentDueAt: now,
      })
      .returning();
    assignmentReassigned = asgnReasgn;
  });

  afterAll(async () => {
    // Teardown test fixtures
    try {
      if (projectX?.id) {
        await db.delete(workSessions).where(eq(workSessions.projectId, projectX.id));
        await db.delete(contentAssignments).where(eq(contentAssignments.projectId, projectX.id));
        await db.delete(contentItems).where(eq(contentItems.projectId, projectX.id));
        await db.delete(projectMemberships).where(eq(projectMemberships.projectId, projectX.id));
        await db.delete(projects).where(eq(projects.id, projectX.id));
      }
      if (projectNoMembership?.id) {
        await db.delete(projectMemberships).where(eq(projectMemberships.projectId, projectNoMembership.id));
        await db.delete(projects).where(eq(projects.id, projectNoMembership.id));
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  });

  it("1. New assignment is created with status = 'assigned'", () => {
    expect(assignmentA.status).toBe("assigned");
  });

  it("2. Designer sees deliverable immediately without acceptance", async () => {
    // Check Content Detail
    const detailRes = await getAuthoritativeContentItemDetailAction(projectX.id, taskA.id, designerA.id);
    expect(detailRes.success).toBe(true);
    expect(detailRes.data?.item.id).toBe(taskA.id);
    expect(detailRes.data?.activeAssignment?.id).toBe(assignmentA.id);
    expect(detailRes.data?.activeAssignment?.status).toBe("assigned");

    // Check Calendar
    const calRes = await getAuthoritativeOrganizationCalendarAction(designerA.id);
    expect(calRes.success).toBe(true);
    const calItem = calRes.items.find((i) => i.id === taskA.id);
    expect(calItem).toBeDefined();

    // Check Dashboard
    const dashRes = await getAuthoritativeMainDashboardAction(designerA.id);
    expect(dashRes.success).toBe(true);
    const allDesignerTasks = [
      ...(dashRes.data?.employeePersonalView?.dueTodayTasks || []),
      ...(dashRes.data?.employeePersonalView?.overdueTasks || []),
      ...(dashRes.data?.employeePersonalView?.queueTomorrow || []),
      ...(dashRes.data?.employeePersonalView?.queueUpcoming || []),
    ];
    const dashItem = allDesignerTasks.find((i) => i.id === taskA.id);
    expect(dashItem).toBeDefined();
  });

  it("3. No accept-assignment action is required to begin work", async () => {
    // Verify assignment is still 'assigned' before starting timer
    const [asgnBefore] = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.id, assignmentA.id));
    expect(asgnBefore.status).toBe("assigned");
  });

  it("4. Start timer succeeds directly from 'assigned' status", async () => {
    const res = await startWorkSessionAction({
      contentItemId: taskA.id,
      actorUserId: designerA.id,
    });
    expect(res.success).toBe(true);
    expect(res.workSession).toBeDefined();
    expect(res.workSession.status).toBe("active");
    activeSessionA = res.workSession;
  });

  it("5. Starting timer atomically transitions assignment to 'in_progress'", async () => {
    const [asgnAfter] = await db
      .select()
      .from(contentAssignments)
      .where(eq(contentAssignments.id, assignmentA.id));
    expect(asgnAfter.status).toBe("in_progress");
  });

  it("6. work_session.assignment_id equals canonical content_assignments.id", () => {
    expect(activeSessionA.assignmentId).toBe(assignmentA.id);
    expect(activeSessionA.contentItemId).toBe(taskA.id);
    expect(activeSessionA.userId).toBe(designerA.id);
  });

  it("7. Designer cannot start timer on another designer's task", async () => {
    const res = await startWorkSessionAction({
      contentItemId: taskB.id,
      actorUserId: designerA.id, // Task B is assigned to Designer B
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe("ASSIGNMENT_NOT_FOUND");
    expect(res.error).toBe("Assignment not found for this deliverable.");
  });

  it("8. Designer cannot start timer on a project without membership", async () => {
    // Create task in projectNoMembership
    const [taskNoMember] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId: founderUser.orgId,
        projectId: projectNoMembership.id,
        title: `Task in Forbidden Project ${Date.now()}`,
        contentType: "post",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        submissionDeadline: new Date(),
      })
      .returning();

    // Maliciously create assignment pointing to Designer A in that project
    const [asgnNoMember] = await db
      .insert(contentAssignments)
      .values({
        id: crypto.randomUUID(),
        orgId: founderUser.orgId,
        projectId: projectNoMembership.id,
        contentItemId: taskNoMember.id,
        assigneeUserId: designerA.id,
        assignedByUserId: founderUser.id,
        assignmentRole: "designer",
        status: "assigned",
        initialDueAt: new Date(),
        currentDueAt: new Date(),
      })
      .returning();

    const res = await startWorkSessionAction({
      contentItemId: taskNoMember.id,
      actorUserId: designerA.id,
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe("PROJECT_ACCESS_DENIED");

    // Clean up
    await db.delete(contentAssignments).where(eq(contentAssignments.id, asgnNoMember.id));
    await db.delete(contentItems).where(eq(contentItems.id, taskNoMember.id));
  });

  it("9. Designer cannot run two simultaneous active timers (enforces ACTIVE_TIMER_CONFLICT)", async () => {
    // Designer A currently has activeSessionA running on Task A.
    // Create Task A2 assigned to Designer A in Project X
    const [taskA2] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        orgId: founderUser.orgId,
        projectId: projectX.id,
        title: `Task A2 Second Task - ${Date.now()}`,
        contentType: "post",
        workType: "Standard",
        platform: "Instagram",
        stage: "draft",
        submissionDeadline: new Date(),
      })
      .returning();

    await db.insert(contentAssignments).values({
      id: crypto.randomUUID(),
      orgId: founderUser.orgId,
      projectId: projectX.id,
      contentItemId: taskA2.id,
      assigneeUserId: designerA.id,
      assignedByUserId: founderUser.id,
      assignmentRole: "designer",
      status: "assigned",
      initialDueAt: new Date(),
      currentDueAt: new Date(),
    });

    // Try starting timer on Task A2 while Task A is active
    const res = await startWorkSessionAction({
      contentItemId: taskA2.id,
      actorUserId: designerA.id,
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe("ACTIVE_TIMER_CONFLICT");
    expect(res.activeTaskTitle).toBeDefined();
    expect(res.error).toContain("Active timer already running");
  });

  it("10. Existing historical accepted assignment can still start timer", async () => {
    // Pause Task A active session first
    await pauseWorkSessionAction({
      workSessionId: activeSessionA.id,
      actorUserId: designerA.id,
    });

    const res = await startWorkSessionAction({
      contentItemId: taskHistoricalAccepted.id,
      actorUserId: designerA.id,
    });
    expect(res.success).toBe(true);
    expect(res.workSession).toBeDefined();
    expect(res.workSession.status).toBe("active");

    // Stop it immediately
    await stopWorkSessionAction({
      workSessionId: res.workSession.id,
      actorUserId: designerA.id,
    });
  });

  it("11. Reassigned/inactive assignment cannot start timer", async () => {
    const res = await startWorkSessionAction({
      contentItemId: taskReassigned.id,
      actorUserId: designerA.id,
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe("ASSIGNMENT_NOT_FOUND");
  });

  it("12. Timer stop persists actual duration", async () => {
    // Resume Task A
    const resumeRes = await resumeWorkSessionAction({
      workSessionId: activeSessionA.id,
      actorUserId: designerA.id,
    });
    expect(resumeRes.success).toBe(true);

    // Stop session
    const stopRes = await stopWorkSessionAction({
      workSessionId: activeSessionA.id,
      actorUserId: designerA.id,
    });
    expect(stopRes.success).toBe(true);
    expect(stopRes.workSession.status).toBe("completed");
    expect(stopRes.workSession.endedAt).toBeDefined();
  });

  it("13. Refresh shows persisted session/time", async () => {
    const detail = await getAuthoritativeContentItemDetailAction(projectX.id, taskA.id, designerA.id);
    expect(detail.success).toBe(true);
    expect(detail.data?.itemWorkSessions.length).toBeGreaterThanOrEqual(1);
    const persisted = detail.data?.itemWorkSessions.find((ws) => ws.id === activeSessionA.id);
    expect(persisted).toBeDefined();
    expect(persisted?.status).toBe("completed");
  });

  it("14. No 'Accept Deliverable Assignment' text exists in the designer deliverable detail page", () => {
    const pageFilePath = path.resolve(__dirname, "../../app/(dashboard)/projects/[projectId]/content/[itemId]/page.tsx");
    const pageContent = fs.readFileSync(pageFilePath, "utf-8");
    expect(pageContent).not.toContain("Accept Deliverable Assignment");
    expect(pageContent).not.toContain("acceptContentAssignment");
  });

  it("15. ASSIGNMENT_NOT_FOUND and ACTIVE_TIMER_CONFLICT return distinct error codes and messages", async () => {
    // 1. Conflict test
    // Start session on Task Historical
    const s1 = await startWorkSessionAction({
      contentItemId: taskHistoricalAccepted.id,
      actorUserId: designerA.id,
    });
    expect(s1.success).toBe(true);

    // Conflict error
    const conflictRes = await startWorkSessionAction({
      contentItemId: taskA.id,
      actorUserId: designerA.id,
    });
    expect(conflictRes.code).toBe("ACTIVE_TIMER_CONFLICT");
    expect(conflictRes.error).toContain("Active timer already running");

    // Clean up active session
    await stopWorkSessionAction({
      workSessionId: s1.workSession.id,
      actorUserId: designerA.id,
    });

    // 2. Assignment not found error
    const notFoundRes = await startWorkSessionAction({
      contentItemId: taskB.id,
      actorUserId: designerA.id,
    });
    expect(notFoundRes.code).toBe("ASSIGNMENT_NOT_FOUND");
    expect(notFoundRes.error).toBe("Assignment not found for this deliverable.");

    // Distinct codes and messages
    expect(conflictRes.code).not.toBe(notFoundRes.code);
    expect(conflictRes.error).not.toBe(notFoundRes.error);
  });
});
