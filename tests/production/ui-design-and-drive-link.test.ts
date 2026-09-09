import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";
import { db } from "../../lib/db";
import {
  organizations,
  projects,
  users,
  projectMemberships,
  contentItems,
  contentAssignments,
  submissionVersions,
  submissionAssets,
  creativeAssets,
} from "../../lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  attachExternalAssetAction,
  removeCreativeAssetFromSubmissionAction,
} from "../../lib/actions/assets";
import { getAuthoritativeContentItemDetailAction } from "../../lib/actions/contentDetail";
import { createProjectAction } from "../../lib/actions/projects";
import { createContentItemAction } from "../../lib/actions/content";
import { getAuthoritativeProjectKanbanAction } from "../../lib/actions/kanban";
import { getAuthoritativeOrganizationCalendarAction } from "../../lib/actions/calendar";

import { randomUUID } from "crypto";

describe("UI Design Project Type & Drive Link External Asset Suite", () => {
  enforceTestSafetyGuard("UI Design & Drive Link Test Suite");

  let orgId: string;
  let dmProjectId: string;
  let uiProjectId: string;
  let founderId: string;
  let designerId: string;
  let otherDesignerId: string;
  let dmItemId: string;
  let createdAssetId: string | null = null;

  beforeAll(async () => {
    // 1. Fetch existing active founder on staging
    const [founder] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);

    expect(founder).toBeDefined();
    founderId = founder.id;
    orgId = founder.orgId;

    // 2. Create isolated test designers
    const [designer] = await db
      .insert(users)
      .values({
        orgId,
        email: `staging_uidesigner_${Date.now()}@test.internal`,
        normalizedEmail: `staging_uidesigner_${Date.now()}@test.internal`,
        fullName: "Staging UI Designer",
        organizationRole: "designer",
        status: "active",
      })
      .returning();
    designerId = designer.id;

    const [otherDesigner] = await db
      .insert(users)
      .values({
        orgId,
        email: `staging_other_designer_${Date.now()}@test.internal`,
        normalizedEmail: `staging_other_designer_${Date.now()}@test.internal`,
        fullName: "Other Staging Designer",
        organizationRole: "designer",
        status: "active",
      })
      .returning();
    otherDesignerId = otherDesigner.id;

    // 3. Create test projects: one DM and one UI Design
    const [dmProj] = await db
      .insert(projects)
      .values({
        orgId,
        name: "Standard DM Project " + Date.now(),
        clientName: "DM Client",
        projectType: "digital_marketing",
        status: "active",
      })
      .returning();
    dmProjectId = dmProj.id;

    const [uiProj] = await db
      .insert(projects)
      .values({
        orgId,
        name: "SaaS App Redesign " + Date.now(),
        clientName: "TechCorp UI",
        projectType: "ui_design",
        masterFigmaUrl: "https://www.figma.com/design/test-master-file",
        status: "active",
      })
      .returning();
    uiProjectId = uiProj.id;

    // 4. Project Memberships
    await db.insert(projectMemberships).values([
      {
        projectId: dmProjectId,
        userId: designerId,
        orgId,
        membershipRole: "designer",
        status: "active",
      },
      {
        projectId: dmProjectId,
        userId: otherDesignerId,
        orgId,
        membershipRole: "designer",
        status: "active",
      },
      {
        projectId: uiProjectId,
        userId: designerId,
        orgId,
        membershipRole: "designer",
        status: "active",
      },
      {
        projectId: uiProjectId,
        userId: otherDesignerId,
        orgId,
        membershipRole: "designer",
        status: "active",
      },
    ]);
  });

  afterAll(async () => {
    // Cleanup fixtures safely
    try {
      if (createdAssetId) {
        await db.delete(submissionAssets).where(eq(submissionAssets.creativeAssetId, createdAssetId));
        await db.delete(creativeAssets).where(eq(creativeAssets.id, createdAssetId));
      }
      await db.delete(contentAssignments).where(eq(contentAssignments.assigneeUserId, designerId));
      await db.delete(contentAssignments).where(eq(contentAssignments.assigneeUserId, otherDesignerId));
      await db.delete(submissionVersions).where(eq(submissionVersions.contentItemId, dmItemId));
      await db.delete(contentItems).where(eq(contentItems.projectId, dmProjectId));
      await db.delete(contentItems).where(eq(contentItems.projectId, uiProjectId));
      await db.delete(projectMemberships).where(eq(projectMemberships.projectId, dmProjectId));
      await db.delete(projectMemberships).where(eq(projectMemberships.projectId, uiProjectId));
      await db.delete(projects).where(eq(projects.id, dmProjectId));
      await db.delete(projects).where(eq(projects.id, uiProjectId));
      await db.delete(users).where(eq(users.id, designerId));
      await db.delete(users).where(eq(users.id, otherDesignerId));
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  describe("Part 1: Drive Link External Asset Attachment", () => {
    beforeAll(async () => {
      dmItemId = randomUUID();
      // Create a test deliverable with active assignment
      await db.insert(contentItems).values({
        id: dmItemId,
        projectId: dmProjectId,
        orgId,
        title: "Test Drive Link Deliverable",
        stage: "draft",
        platform: "Instagram",
        contentType: "post",
        accountableOwnerId: designerId,
      });

      await db.insert(contentAssignments).values({
        id: randomUUID(),
        contentItemId: dmItemId,
        projectId: dmProjectId,
        orgId,
        assigneeUserId: designerId,
        assignedByUserId: founderId,
        role: "designer",
        status: "in_progress",
        initialDueAt: new Date(),
        currentDueAt: new Date(),
      });
    });

    let draftVersionId: string;

    it("rejects invalid non-HTTP URL schemas", async () => {
      const res = await attachExternalAssetAction({
        actorUserId: designerId,
        projectId: dmProjectId,
        contentItemId: dmItemId,
        externalUrl: "ftp://invalid-server.com/file",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/HTTP or HTTPS/i);
    });

    it("rejects unauthorized user who is not assigned to the item", async () => {
      const res = await attachExternalAssetAction({
        actorUserId: otherDesignerId,
        projectId: dmProjectId,
        contentItemId: dmItemId,
        externalUrl: "https://drive.google.com/file/d/test12345/view",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Forbidden/i);
    });

    it("successfully attaches Drive link for assigned designer", async () => {
      const testUrl = "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing";
      const res = await attachExternalAssetAction({
        actorUserId: designerId,
        projectId: dmProjectId,
        contentItemId: dmItemId,
        externalUrl: testUrl,
        filename: "Client Brand Assets (Drive)",
      });

      expect(res.success).toBe(true);
      expect(res.assetId).toBeDefined();
      expect(res.submissionVersionId).toBeDefined();
      createdAssetId = res.assetId!;
      draftVersionId = res.submissionVersionId!;

      // Verify DB row
      const [assetRow] = await db
        .select()
        .from(creativeAssets)
        .where(eq(creativeAssets.id, createdAssetId));

      expect(assetRow).toBeDefined();
      expect(assetRow.isDriveLink).toBe(true);
      expect(assetRow.driveUrl).toBe(testUrl);
      expect(assetRow.status).toBe("ready");
      expect(assetRow.r2ObjectKey).toBe(`external/${createdAssetId}`);
    });

    it("survives refresh and is returned in getAuthoritativeContentItemDetailAction", async () => {
      const detailRes = await getAuthoritativeContentItemDetailAction(dmProjectId, dmItemId, designerId);
      expect(detailRes.success).toBe(true);
      expect(detailRes.data).toBeDefined();

      const version = detailRes.data!.itemVersions[0];
      expect(version).toBeDefined();
      expect(version.creativeAssets.length).toBeGreaterThan(0);

      const attachedAsset = version.creativeAssets.find((a) => a.assetId === createdAssetId);
      expect(attachedAsset).toBeDefined();
      expect(attachedAsset?.isDriveLink).toBe(true);
      expect(attachedAsset?.driveUrl).toContain("drive.google.com");
      expect(attachedAsset?.previewUrl).toContain("drive.google.com");
    });

    it("can be authoritatively removed by the assigned designer", async () => {
      const removeRes = await removeCreativeAssetFromSubmissionAction({
        assetId: createdAssetId!,
        submissionVersionId: draftVersionId,
        actorUserId: designerId,
      });
      expect(removeRes.success).toBe(true);

      const detailRes = await getAuthoritativeContentItemDetailAction(dmProjectId, dmItemId, designerId);
      const version = detailRes.data!.itemVersions[0];
      const attachedAsset = version.creativeAssets.find((a) => a.assetId === createdAssetId);
      expect(attachedAsset).toBeUndefined();
    });
  });

  describe("Part 2: UI Design Project Type & Tasks", () => {
    it("creates a UI Design project with master Figma URL", async () => {
      const res = await createProjectAction({
        name: "Dashboard Redesign 2026",
        clientBrand: "Acme SaaS",
        projectType: "ui_design",
        masterFigmaUrl: "https://www.figma.com/design/master123",
        actorUserId: founderId,
      });

      expect(res.success).toBe(true);
      expect(res.project?.projectType).toBe("ui_design");
      expect(res.project?.masterFigmaUrl).toBe("https://www.figma.com/design/master123");

      // Cleanup
      if (res.project?.id) {
        await db.delete(projects).where(eq(projects.id, res.project.id));
      }
    });

    it("creates a UI Design task with figmaUrl and clientDeliveryDate", async () => {
      const clientDelivery = "2026-10-15T00:00:00.000Z";
      const submissionDeadline = "2026-10-10T00:00:00.000Z";

      const res = await createContentItemAction({
        actorUserId: founderId,
        projectId: uiProjectId,
        title: "Settings & Profile Screen",
        platform: "Instagram",
        contentType: "post",
        workType: "Simple Static Poster",
        figmaUrl: "https://www.figma.com/design/screen-spec-456",
        clientDeliveryDate: clientDelivery,
        submissionDeadline,
        accountableOwnerId: designerId,
        brief: "Complete settings navigation and user profile layout.",
      });

      expect(res.success).toBe(true);
      expect(res.item).toBeDefined();

      const itemId = res.item!.id;

      // Verify Content Detail DTO
      const detailRes = await getAuthoritativeContentItemDetailAction(uiProjectId, itemId, designerId);
      expect(detailRes.success).toBe(true);
      expect(detailRes.data?.project.projectType).toBe("ui_design");
      expect(detailRes.data?.project.masterFigmaUrl).toBe("https://www.figma.com/design/test-master-file");
      expect(detailRes.data?.item.figmaUrl).toBe("https://www.figma.com/design/screen-spec-456");
      expect(detailRes.data?.item.clientDeliveryDate).toBeDefined();

      // Verify Kanban Columns
      const kanbanRes = await getAuthoritativeProjectKanbanAction(uiProjectId, designerId);
      expect(kanbanRes.success).toBe(true);
      expect(kanbanRes.data?.columns.map((c) => c.title)).toEqual([
        "1. TO DO",
        "2. Submitted",
        "3. Internal Review",
        "4. Changes Requested",
        "5. Approved",
        "6. Completed",
      ]);

      // Verify Calendar Item returns projectType and clientDeliveryDate
      const calRes = await getAuthoritativeOrganizationCalendarAction(designerId);
      expect(calRes.success).toBe(true);
      const calItem = calRes.items.find((i) => i.id === itemId);
      expect(calItem).toBeDefined();
      expect(calItem?.projectType).toBe("ui_design");
      expect(calItem?.clientDeliveryDate).toBeDefined();

      // Cleanup created item
      await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, itemId));
      await db.delete(submissionVersions).where(eq(submissionVersions.contentItemId, itemId));
      await db.delete(contentItems).where(eq(contentItems.id, itemId));
    });

    it("verifies existing DM project kanban columns remain untouched", async () => {
      const kanbanRes = await getAuthoritativeProjectKanbanAction(dmProjectId, designerId);
      expect(kanbanRes.success).toBe(true);
      expect(kanbanRes.data?.columns.map((c) => c.title)).toEqual([
        "1. Drafting",
        "2. Submitted",
        "3. In Review",
        "4. Changes Requested",
        "5. Approved",
        "6. Scheduled",
        "7. Published",
      ]);
    });
  });
});
