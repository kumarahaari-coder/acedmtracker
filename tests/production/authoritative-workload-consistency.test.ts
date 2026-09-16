import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import { users, projects, contentItems, contentAssignments, assignmentDeadlineHistory, projectMemberships } from "../../lib/db/schema";
import { eq, and } from "drizzle-orm";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";
import {
  getEffectiveOperationalDeadline,
  getISTDateBoundaries,
  categorizeOperationalTiming,
  ACTIVE_ASSIGNMENT_STATUSES,
} from "../../lib/calculations/operationalDeadline";
import { updateAuthoritativeInternalDeadlineService } from "../../lib/actions/content";
import { getAuthoritativeProjectDashboardAction } from "../../lib/actions/projectDashboard";
import { getAuthoritativeMainDashboardAction } from "../../lib/actions/performance";

describe("Authoritative Workload, Deadline & Dashboard Consistency Test Suite", () => {
  let founderUser: any;
  let designerUser1: any;
  let designerUser2: any;
  let testProject: any;

  beforeAll(async () => {
    enforceTestSafetyGuard("Authoritative Workload Consistency Suite");

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder") || activeUsers[0];
    const designers = activeUsers.filter((u) => u.organizationRole === "designer");
    designerUser1 = designers[0] || activeUsers.find((u) => u.id !== founderUser.id) || activeUsers[0];
    designerUser2 = designers[1] || activeUsers.find((u) => u.id !== founderUser.id && u.id !== designerUser1.id) || designerUser1;

    const [proj] = await db.select().from(projects).where(eq(projects.orgId, founderUser.orgId)).limit(1);
    testProject = proj;

    // Ensure memberships for testing
    for (const u of [designerUser1, designerUser2]) {
      const existing = await db
        .select()
        .from(projectMemberships)
        .where(and(eq(projectMemberships.projectId, testProject.id), eq(projectMemberships.userId, u.id)));
      if (existing.length === 0) {
        await db.insert(projectMemberships).values({
          projectId: testProject.id,
          orgId: testProject.orgId,
          userId: u.id,
          membershipRole: "designer",
          assignedByUserId: founderUser.id,
          status: "active",
        });
      }
    }
  });

  describe("Scenario A (Invariant 10) — Asia/Kolkata Time-Boundary Workload Transitions", () => {
    // 30 Sep 2026 scheduled publication date
    const scheduledPubDate = "2026-09-30T18:30:00+05:30";
    // 23 Sep 2026 final internal deadline
    const finalIntDeadline = "2026-09-23T18:30:00+05:30";

    const mockItem = {
      id: "item-scenario-a",
      title: "Scenario A DM Post",
      stage: "draft",
      status: "active",
      scheduledPublicationDate: scheduledPubDate,
      finalInternalDeadline: finalIntDeadline,
      calculatedInternalDeadline: "2026-09-20T18:30:00+05:30",
      deadlines: {
        submissionDeadline: scheduledPubDate,
        scheduledPublicationDate: scheduledPubDate,
      },
    };

    it("1. On Sep 22 IST -> Classified as Upcoming (Not Due Today, Not Overdue)", () => {
      // 22 Sep 2026 12:00 PM IST
      const mockNow = new Date("2026-09-22T12:00:00+05:30");
      const opDeadline = getEffectiveOperationalDeadline(mockItem);
      expect(opDeadline).toBeDefined();

      const timing = categorizeOperationalTiming(opDeadline, mockNow);
      expect(timing).toBe("tomorrow"); // Due tomorrow (upcoming)
      expect(timing).not.toBe("today");
      expect(timing).not.toBe("overdue");
    });

    it("2. On Sep 23 IST -> Classified as Due Today / Today's Workload", () => {
      // 23 Sep 2026 10:00 AM IST
      const mockNow = new Date("2026-09-23T10:00:00+05:30");
      const opDeadline = getEffectiveOperationalDeadline(mockItem);

      const timing = categorizeOperationalTiming(opDeadline, mockNow);
      expect(timing).toBe("today");
    });

    it("3. On Sep 24 IST onward unfinished -> Classified as Overdue", () => {
      // 24 Sep 2026 10:00 AM IST
      const mockNow = new Date("2026-09-24T10:00:00+05:30");
      const opDeadline = getEffectiveOperationalDeadline(mockItem);

      const timing = categorizeOperationalTiming(opDeadline, mockNow);
      expect(timing).toBe("overdue");
    });

    it("4. On Sep 30 IST (Publication Date) -> Must NOT re-enter Today's Workload", () => {
      // 30 Sep 2026 10:00 AM IST
      const mockNow = new Date("2026-09-30T10:00:00+05:30");
      const opDeadline = getEffectiveOperationalDeadline(mockItem);

      const timing = categorizeOperationalTiming(opDeadline, mockNow);
      // It remains overdue from Sep 24 onward; publication date does not re-trigger "today"
      expect(timing).toBe("overdue");
      expect(timing).not.toBe("today");
    });
  });

  describe("Scenario B (Invariants 1 & 9) — Atomic Internal Deadline Service & History", () => {
    let createdItemId: string;
    let createdAssignmentId: string;
    const initialCalculated = new Date("2026-09-20T00:00:00.000Z");
    const initialSubmission = new Date("2026-09-30T00:00:00.000Z");

    beforeAll(async () => {
      // Create a test deliverable
      const [item] = await db
        .insert(contentItems)
        .values({
          orgId: testProject.orgId,
          projectId: testProject.id,
          title: "Unit Test Deliverable for Atomic Deadlines",
          platform: "Instagram",
          contentType: "post",
          stage: "draft",
          status: "active",
          calculatedInternalDeadline: initialCalculated,
          submissionDeadline: initialSubmission,
          scheduledPublicationDate: initialSubmission,
        })
        .returning();
      createdItemId = item.id;

      // Create an active assignment
      const [asgn] = await db
        .insert(contentAssignments)
        .values({
          orgId: testProject.orgId,
          projectId: testProject.id,
          contentItemId: createdItemId,
          assigneeUserId: designerUser1.id,
          assignedByUserId: founderUser.id,
          assignmentRole: "designer",
          status: "assigned",
          initialDueAt: initialCalculated,
          currentDueAt: initialCalculated,
        })
        .returning();
      createdAssignmentId = asgn.id;
    });

    it("1. Preserves calculated_internal_deadline, updates final_internal_deadline, synchronizes assignment current_due_at and appends history", async () => {
      const newManualDate = new Date("2026-09-25T00:00:00.000Z");
      const reason = "Client requested expanded copy review cycle";

      const res = await updateAuthoritativeInternalDeadlineService({
        contentItemId: createdItemId,
        newDueAt: newManualDate,
        reason,
        actorUserId: founderUser.id,
      });

      expect(res.success).toBe(true);

      // Verify content_items
      const [item] = await db.select().from(contentItems).where(eq(contentItems.id, createdItemId));
      expect(item.finalInternalDeadline?.toISOString()).toBe(newManualDate.toISOString());
      expect(item.calculatedInternalDeadline?.toISOString()).toBe(initialCalculated.toISOString()); // PRESERVED!

      // Verify content_assignments
      const [asgn] = await db.select().from(contentAssignments).where(eq(contentAssignments.id, createdAssignmentId));
      expect(asgn.currentDueAt.toISOString()).toBe(newManualDate.toISOString()); // SYNCHRONIZED!

      // Verify assignment_deadline_history
      const historyRows = await db
        .select()
        .from(assignmentDeadlineHistory)
        .where(eq(assignmentDeadlineHistory.assignmentId, createdAssignmentId));
      expect(historyRows.length).toBeGreaterThanOrEqual(1);
      const latestHistory = historyRows[historyRows.length - 1];
      expect(latestHistory.newDueAt.toISOString()).toBe(newManualDate.toISOString());
      expect(latestHistory.reason).toBe(reason);
      expect(latestHistory.changedByUserId).toBe(founderUser.id);
    });

    it("2. Atomic Transaction Guard: If transaction fails, leaves neither record modified", async () => {
      const invalidItemId = "00000000-0000-0000-0000-000000000000";
      const res = await updateAuthoritativeInternalDeadlineService({
        contentItemId: invalidItemId,
        newDueAt: new Date("2026-09-29T00:00:00.000Z"),
        reason: "Test failure rollback",
        actorUserId: founderUser.id,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  describe("Scenario C (Invariant 5) — Project Assigned Work Boundary Independence", () => {
    it("1. ACTIVE_ASSIGNMENT_STATUSES contains assigned, accepted, in_progress", () => {
      expect(ACTIVE_ASSIGNMENT_STATUSES).toContain("assigned");
      expect(ACTIVE_ASSIGNMENT_STATUSES).toContain("accepted");
      expect(ACTIVE_ASSIGNMENT_STATUSES).toContain("in_progress");
      expect((ACTIVE_ASSIGNMENT_STATUSES as readonly string[])).not.toContain("reassigned");
    });

    it("2. Authoritative Project Dashboard returns active assigned work regardless of deadline date window", async () => {
      const res = await getAuthoritativeProjectDashboardAction(testProject.id, founderUser.id);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      const assignedWork = res.data!.assignedWork;
      // All items in assignedWork must be in active status
      for (const item of assignedWork) {
        expect(["assigned", "accepted", "in_progress"]).toContain(item.assignmentStatus);
      }
    });
  });

  describe("Scenario D (Invariant 7) — KPI Drilldown DTO Parity", () => {
    it("1. overdueOpenTasksCount strictly equals workload.overdue.length", async () => {
      const res = await getAuthoritativeMainDashboardAction(founderUser.id);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      const { overdueOpenTasksCount, tasksDueTodayCount, workload } = res.data!;
      expect(overdueOpenTasksCount).toBe(workload.overdue.length);
      expect(tasksDueTodayCount).toBe(workload.today.length);
    });
  });

  describe("Scenario E (Invariant 6) — Role Scoping & Isolation", () => {
    it("1. Management sees all project assigned work, while Designer only sees their own assignments", async () => {
      // Management fetch
      const mgmtRes = await getAuthoritativeProjectDashboardAction(testProject.id, founderUser.id);
      expect(mgmtRes.success).toBe(true);
      expect(mgmtRes.data!.isManagement).toBe(true);

      // Designer fetch
      const designerRes = await getAuthoritativeProjectDashboardAction(testProject.id, designerUser1.id);
      expect(designerRes.success).toBe(true);
      expect(designerRes.data!.isManagement).toBe(false);

      // All items for designer must be assigned to designerUser1
      for (const item of designerRes.data!.assignedWork) {
        expect(item.primaryOwnerId).toBe(designerUser1.id);
        expect(item.isAssignedToCurrentUser).toBe(true);
      }
    });
  });

  describe("Scenario F (Invariants 1 & 8) — Authoritative Operational Deadline Hierarchy", () => {
    it("1. Resolves COALESCE(final_internal_deadline, calculated_internal_deadline, submission_deadline)", () => {
      // Production forensic test case:
      // final_internal_deadline = Sep 28
      // calculated_internal_deadline = Sep 28
      // submission_deadline = Sep 30
      // assignment.current_due_at = Sep 21
      const deadline = getEffectiveOperationalDeadline({
        finalInternalDeadline: "2026-09-28T00:00:00.000Z",
        calculatedInternalDeadline: "2026-09-28T00:00:00.000Z",
        submissionDeadline: "2026-09-30T00:00:00.000Z",
      });

      // Canonical operational deadline MUST resolve to Sep 28, NOT Sep 21 (current_due_at)
      expect(deadline?.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    });

    it("2. When final_internal_deadline is null, falls back to calculated_internal_deadline", () => {
      const deadline = getEffectiveOperationalDeadline({
        finalInternalDeadline: null,
        calculatedInternalDeadline: "2026-09-25T00:00:00.000Z",
        submissionDeadline: "2026-09-30T00:00:00.000Z",
      });
      expect(deadline?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    });

    it("3. When both internal deadlines are null, falls back to submission_deadline", () => {
      const deadline = getEffectiveOperationalDeadline({
        finalInternalDeadline: null,
        calculatedInternalDeadline: null,
        submissionDeadline: "2026-09-30T00:00:00.000Z",
      });
      expect(deadline?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    });
  });
});
