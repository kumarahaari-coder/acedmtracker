import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertNonProductionEnvironment } from "@/lib/guards/environment-safety";
import { db } from "@/lib/db";
import {
  users,
  projects,
  projectMemberships,
  contentItems,
  contentGroups,
  submissionVersions,
  contentAssignments,
  effortStandards,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  createContentItemAction,
  createContentGroupAction,
} from "@/lib/actions/content";
import { getAuthoritativeMainDashboardAction } from "@/lib/actions/performance";
import { calculateEmployeeScorecard, calculateProjectPerformance, getPeriodDateRange } from "@/lib/calculations/operationalEngine";

describe("Planned Effort Snapshot, Project-Scoped Assignee & Group Effort Acceptance", () => {
  let founderUser: any;
  let testProject: any;
  let memberDesigner: any;
  let nonMemberEmployee: any;
  let standard1h: any;

  const cleanupItemIds: string[] = [];
  const cleanupGroupIds: string[] = [];
  const cleanupStandardIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupMembershipIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  beforeAll(async () => {
    assertNonProductionEnvironment("Planned effort and assignee runtime acceptance test");

    // 1. Resolve Founder
    const [f] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);
    founderUser = f;

    // 2. Create isolated test project
    const [proj] = await db
      .insert(projects)
      .values({
        orgId: founderUser.orgId,
        name: "Test Operational Effort Project " + Date.now(),
        clientName: "Staging Client",
        status: "active",
      })
      .returning();
    testProject = proj;
    cleanupProjectIds.push(proj.id);

    // 3. Create active Member Designer on this project
    const [designer] = await db
      .insert(users)
      .values({
        orgId: founderUser.orgId,
        email: `staging_designer_${Date.now()}@test.com`,
        normalizedEmail: `staging_designer_${Date.now()}@test.com`,
        fullName: "Staging Ramesh Designer",
        organizationRole: "designer",
        status: "active",
      })
      .returning();
    memberDesigner = designer;
    cleanupUserIds.push(designer.id);

    const [mem] = await db
      .insert(projectMemberships)
      .values({
        orgId: founderUser.orgId,
        projectId: testProject.id,
        userId: memberDesigner.id,
        membershipRole: "designer",
        status: "active",
      })
      .returning();
    cleanupMembershipIds.push(mem.id);

    // Also add founder as project consultant/member so founder has write access
    const [founderMem] = await db
      .insert(projectMemberships)
      .values({
        orgId: founderUser.orgId,
        projectId: testProject.id,
        userId: founderUser.id,
        membershipRole: "consultant",
        status: "active",
      })
      .returning();
    cleanupMembershipIds.push(founderMem.id);

    // 4. Create Non-Member Employee (in organization, but NOT in testProject)
    const [nonMem] = await db
      .insert(users)
      .values({
        orgId: founderUser.orgId,
        email: `staging_nonmember_${Date.now()}@test.com`,
        normalizedEmail: `staging_nonmember_${Date.now()}@test.com`,
        fullName: "Staging Irfan NonMember",
        organizationRole: "designer",
        status: "active",
      })
      .returning();
    nonMemberEmployee = nonMem;
    cleanupUserIds.push(nonMem.id);

    // 5. Create custom 1.00h Master Effort Standard
    const [std] = await db
      .insert(effortStandards)
      .values({
        orgId: founderUser.orgId,
        category: "Static",
        workType: "Quick Social Graphic (1.00h)",
        contentSeconds: 1200,
        productionSeconds: 2400,
        totalSeconds: 3600,
        leadTimeWorkdays: 1,
        active: true,
      })
      .returning();
    standard1h = std;
    cleanupStandardIds.push(std.id);
  });

  afterAll(async () => {
    if (cleanupItemIds.length > 0) {
      await db.delete(contentAssignments).where(inArray(contentAssignments.contentItemId, cleanupItemIds));
      await db.delete(submissionVersions).where(inArray(submissionVersions.contentItemId, cleanupItemIds));
      await db.delete(contentItems).where(inArray(contentItems.id, cleanupItemIds));
    }
    if (cleanupGroupIds.length > 0) {
      await db.delete(contentGroups).where(inArray(contentGroups.id, cleanupGroupIds));
    }
    if (cleanupStandardIds.length > 0) {
      await db.delete(effortStandards).where(inArray(effortStandards.id, cleanupStandardIds));
    }
    if (cleanupMembershipIds.length > 0) {
      await db.delete(projectMemberships).where(inArray(projectMemberships.id, cleanupMembershipIds));
    }
    if (cleanupUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, cleanupUserIds));
    }
    if (cleanupProjectIds.length > 0) {
      await db.delete(projects).where(inArray(projects.id, cleanupProjectIds));
    }
  });

  // TEST A: EFFORT SNAPSHOT ACCURACY
  it("Test A: snapshots exact planned effort into PostgreSQL and Dashboard without 2h fallback", async () => {
    // 1. Simple Static Poster -> 1.50h (5400s)
    const posterRes: any = await createContentItemAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      title: "Test Simple Static Poster",
      platform: "Instagram",
      contentType: "post",
      workType: "Simple Static Poster",
      scheduledPublicationDate: new Date().toISOString(),
      accountableOwnerId: memberDesigner.id,
    });
    expect(posterRes.success).toBe(true);
    cleanupItemIds.push(posterRes.item.id);

    const [dbPoster] = await db.select().from(contentItems).where(eq(contentItems.id, posterRes.item.id));
    expect(dbPoster.finalPlannedSeconds).toBe(5400);
    expect(dbPoster.workType).toBe("Simple Static Poster");
    expect(dbPoster.isEffortAnchor).toBe(true);

    // 2. Short-form Reel -> 3.75h (13500s)
    const reelRes: any = await createContentItemAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      title: "Test Short-form Reel",
      platform: "Instagram",
      contentType: "reel",
      workType: "Short-form Reel",
      scheduledPublicationDate: new Date().toISOString(),
      accountableOwnerId: memberDesigner.id,
    });
    expect(reelRes.success).toBe(true);
    cleanupItemIds.push(reelRes.item.id);

    const [dbReel] = await db.select().from(contentItems).where(eq(contentItems.id, reelRes.item.id));
    expect(dbReel.finalPlannedSeconds).toBe(13500);
    expect(dbReel.workType).toBe("Short-form Reel");

    // 3. Custom 1.00h Work Type -> 1.00h (3600s)
    const customRes: any = await createContentItemAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      title: "Test 1h Custom Standard",
      platform: "Instagram",
      contentType: "post",
      workType: standard1h.workType,
      workTypeId: standard1h.id,
      scheduledPublicationDate: new Date().toISOString(),
      accountableOwnerId: memberDesigner.id,
    });
    expect(customRes.success).toBe(true);
    cleanupItemIds.push(customRes.item.id);

    const [dbCustom] = await db.select().from(contentItems).where(eq(contentItems.id, customRes.item.id));
    expect(dbCustom.finalPlannedSeconds).toBe(3600);

    // Verify Main Dashboard DTO reflects exact hours (1.50h, 3.75h, 1.00h)
    const dashRes = await getAuthoritativeMainDashboardAction();
    expect(dashRes.success).toBe(true);

    const posterRow = dashRes.data?.todaysWorkload.find((r) => r.id === dbPoster.id);
    const reelRow = dashRes.data?.todaysWorkload.find((r) => r.id === dbReel.id);
    const customRow = dashRes.data?.todaysWorkload.find((r) => r.id === dbCustom.id);

    if (posterRow) expect(posterRow.plannedHours).toBe(1.5);
    if (reelRow) expect(reelRow.plannedHours).toBe(3.75);
    if (customRow) expect(customRow.plannedHours).toBe(1.0);
  });

  // TEST B: PROJECT-SCOPED ASSIGNMENT REJECTION
  it("Test B: rejects assignment to non-project-member organization user", async () => {
    // Attempt assignment to nonMemberEmployee (Irfan)
    const invalidRes: any = await createContentItemAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      title: "Invalid Assignment Poster",
      platform: "Instagram",
      contentType: "post",
      workType: "Simple Static Poster",
      accountableOwnerId: nonMemberEmployee.id,
    });

    expect(invalidRes.success).toBe(false);
    expect(invalidRes.error).toContain("Assignee is not an active member of this project");
  });

  // TEST C: DASHBOARD & CAPACITY CONSISTENCY
  it("Test C: ensures assigned hours and remaining capacity reflect authoritative snapshot", async () => {
    const period = getPeriodDateRange("this_week");

    // Calculate scorecard for memberDesigner
    const [userRecord] = await db.select().from(users).where(eq(users.id, memberDesigner.id));
    const items = await db.select().from(contentItems).where(eq(contentItems.projectId, testProject.id));
    const asgns = await db.select().from(contentAssignments).where(eq(contentAssignments.projectId, testProject.id));

    const scorecard = calculateEmployeeScorecard(
      {
        id: userRecord.id,
        name: userRecord.fullName,
        email: userRecord.email,
        role: "designer",
        status: "active",
        workingHoursPerDay: 8,
        dateJoined: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      period,
      items.map((i: any) => ({
        ...i,
        deadlines: { submissionDeadline: i.submissionDeadline?.toISOString() },
      })),
      asgns.map((a: any) => ({
        ...a,
        assignedAt: a.assignedAt.toISOString(),
        initialDueAt: a.initialDueAt.toISOString(),
        currentDueAt: a.currentDueAt.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      [],
      [],
      [],
      []
    );

    // Sum of poster (1.5) + reel (3.75) + custom (1.0) = 6.25h assigned
    expect(scorecard.assignedPlannedHours).toBeCloseTo(6.25, 2);
    expect(scorecard.remainingPlannedHours).toBeCloseTo(scorecard.capacity.finalCapacityHours - 6.25, 2);
  });

  // TEST D: MULTI-PLATFORM GROUP EFFORT SEMANTICS
  it("Test D: preserves ContentGroup shared effort (counts 3.75h once, not 3x across 3 platforms)", async () => {
    const groupRes: any = await createContentGroupAction({
      actorUserId: founderUser.id,
      projectId: testProject.id,
      title: "Multi-Platform Campaign Video",
      workType: "Short-form Reel",
      platforms: [
        {
          platform: "Instagram",
          contentType: "reel",
          accountableOwnerId: memberDesigner.id,
          scheduledPublicationDate: new Date().toISOString(),
        },
        {
          platform: "Facebook",
          contentType: "reel",
          accountableOwnerId: memberDesigner.id,
          scheduledPublicationDate: new Date().toISOString(),
        },
        {
          platform: "LinkedIn",
          contentType: "reel",
          accountableOwnerId: memberDesigner.id,
          scheduledPublicationDate: new Date().toISOString(),
        },
      ],
    });

    expect(groupRes.success).toBe(true);
    cleanupGroupIds.push(groupRes.group.id);
    for (const item of groupRes.items) {
      cleanupItemIds.push(item.id);
    }

    // Verify Primary Anchor and Sibling items in PostgreSQL
    const createdItems = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.contentGroupId, groupRes.group.id));

    expect(createdItems.length).toBe(3);

    const anchorItem = createdItems.find((i) => i.isEffortAnchor);
    const siblingItems = createdItems.filter((i) => !i.isEffortAnchor);

    expect(anchorItem).toBeDefined();
    expect(anchorItem!.finalPlannedSeconds).toBe(13500); // 3.75h
    expect(anchorItem!.platform).toBe("Instagram");

    expect(siblingItems.length).toBe(2);
    for (const s of siblingItems) {
      expect(s.isEffortAnchor).toBe(false);
      expect(s.finalPlannedSeconds).toBe(0); // Sibling adaptation defaults to 0
    }

    // Evaluate project performance on this project
    const period = getPeriodDateRange("this_month");
    const allProjItems = await db.select().from(contentItems).where(eq(contentItems.projectId, testProject.id));
    const projScorecard = calculateProjectPerformance(
      {
        id: testProject.id,
        name: testProject.name,
        clientBrand: testProject.clientName,
        avatar: "",
        scope: "",
        timezone: "Asia/Kolkata",
        status: "active",
        targetRequirements: { posts: 0, carousels: 0, reels: 0, trialReels: 0 },
        workflowStages: ["idea", "draft", "in_review", "approved", "published"],
        createdAt: new Date().toISOString(),
      },
      period,
      allProjItems.map((i: any) => ({
        ...i,
        deadlines: { scheduledPublicationDate: i.scheduledPublicationDate?.toISOString() },
      })),
      [],
      [],
      []
    );

    // Previous single tasks (6.25h) + group shared creative (3.75h) = 10.00h total!
    // (Crucially, it is NOT 6.25 + 11.25 = 17.5h!)
    expect(projScorecard.plannedHours).toBeCloseTo(10.0, 2);
  });
});
