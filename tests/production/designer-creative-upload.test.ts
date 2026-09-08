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
  requestCreativeAssetUploadAction,
  confirmCreativeAssetUploadAction,
  removeCreativeAssetFromSubmissionAction,
} from "../../lib/actions/assets";
import { getAuthoritativeContentItemDetailAction } from "../../lib/actions/contentDetail";
import { deleteR2Object } from "../../lib/storage/r2";

describe("Designer Creative Asset Upload & Authoritative Linkage Suite", () => {
  enforceTestSafetyGuard("Designer Creative Asset Upload Suite");

  const orgId = "11111111-1111-1111-1111-111111111111";
  const projectId = "22222222-2222-2222-2222-222222222222";
  const designerId = "33333333-3333-3333-3333-333333333333";
  const otherDesignerId = "44444444-4444-4444-4444-444444444444";
  const contentItemId = "55555555-5555-5555-5555-555555555555";
  const assignmentId = "66666666-6666-6666-6666-666666666666";

  let createdAssetId: string | null = null;
  let createdObjectKey: string | null = null;
  let draftVersionId: string | null = null;

  beforeAll(async () => {
    // 1. Setup Staging Test Fixtures
    await db
      .insert(organizations)
      .values({
        id: orgId,
        name: "Test Upload Org",
        slug: "test-upload-org",
      })
      .onConflictDoNothing();

    await db
      .insert(users)
      .values([
        {
          id: designerId,
          orgId,
          email: "designer.upload@test.internal",
          normalizedEmail: "designer.upload@test.internal",
          fullName: "Designer Upload Tester",
          organizationRole: "designer",
          status: "active",
        },
        {
          id: otherDesignerId,
          orgId,
          email: "other.designer@test.internal",
          normalizedEmail: "other.designer@test.internal",
          fullName: "Other Designer",
          organizationRole: "designer",
          status: "active",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(projects)
      .values({
        id: projectId,
        orgId,
        name: "Upload Test Project",
        clientName: "Upload Client",
        status: "active",
      })
      .onConflictDoNothing();

    await db
      .insert(projectMemberships)
      .values([
        {
          projectId,
          userId: designerId,
          orgId,
          membershipRole: "designer",
          status: "active",
        },
        {
          projectId,
          userId: otherDesignerId,
          orgId,
          membershipRole: "designer",
          status: "active",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(contentItems)
      .values({
        id: contentItemId,
        projectId,
        orgId,
        title: "Test Creative Upload Item",
        platform: "Instagram",
        contentType: "post",
        stage: "draft",
        status: "active",
        finalInternalDeadline: new Date(Date.now() + 86400000),
      })
      .onConflictDoNothing();

    await db
      .insert(contentAssignments)
      .values({
        id: assignmentId,
        projectId,
        orgId,
        contentItemId,
        assigneeUserId: designerId,
        assignedByUserId: designerId,
        status: "assigned",
        initialDueAt: new Date(Date.now() + 86400000),
        currentDueAt: new Date(Date.now() + 86400000),
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    // Cleanup staging fixtures
    if (createdObjectKey) {
      await deleteR2Object(createdObjectKey);
    }
    if (createdAssetId) {
      await db.delete(submissionAssets).where(eq(submissionAssets.creativeAssetId, createdAssetId));
      await db.delete(creativeAssets).where(eq(creativeAssets.id, createdAssetId));
    }
    await db.delete(submissionVersions).where(eq(submissionVersions.contentItemId, contentItemId));
    await db.delete(contentAssignments).where(eq(contentAssignments.contentItemId, contentItemId));
    await db.delete(contentItems).where(eq(contentItems.id, contentItemId));
    await db.delete(projectMemberships).where(eq(projectMemberships.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, designerId));
    await db.delete(users).where(eq(users.id, otherDesignerId));
  });

  it("1. Designer cannot upload to a deliverable assigned to someone else", async () => {
    const res = await requestCreativeAssetUploadAction({
      projectId,
      contentItemId,
      filename: "unauthorized.png",
      mimeType: "image/png",
      fileSizeBytes: 1024,
      actorUserId: otherDesignerId,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not actively assigned/i);
  });

  it("2. Designer can successfully request creative asset upload URL for assigned deliverable", async () => {
    const res = await requestCreativeAssetUploadAction({
      projectId,
      contentItemId,
      filename: "hero-creative.png",
      mimeType: "image/png",
      fileSizeBytes: 2048576, // 2MB
      actorUserId: designerId,
    });

    expect(res.success).toBe(true);
    expect(res.presignedUrl).toBeDefined();
    expect(res.assetId).toBeDefined();
    expect(res.objectKey).toContain(`org/${orgId}/project/${projectId}/asset/`);
    expect(res.submissionVersionId).toBeDefined();

    createdAssetId = res.assetId!;
    createdObjectKey = res.objectKey!;
    draftVersionId = res.submissionVersionId!;

    // Verify pending record in database
    const [assetRow] = await db
      .select()
      .from(creativeAssets)
      .where(eq(creativeAssets.id, createdAssetId))
      .limit(1);

    expect(assetRow).toBeDefined();
    expect(assetRow.status).toBe("pending");
    expect(assetRow.originalFilename).toBe("hero-creative.png");
  });

  it("3. Browser upload can be confirmed and linked to submission version", async () => {
    expect(createdAssetId).toBeDefined();
    expect(draftVersionId).toBeDefined();

    const confirmRes = await confirmCreativeAssetUploadAction({
      assetId: createdAssetId!,
      submissionVersionId: draftVersionId!,
      contentItemId,
      actorUserId: designerId,
    });

    expect(confirmRes.success).toBe(true);
    expect(confirmRes.assetId).toBe(createdAssetId);

    // Verify status updated to ready
    const [assetRow] = await db
      .select()
      .from(creativeAssets)
      .where(eq(creativeAssets.id, createdAssetId!))
      .limit(1);

    expect(assetRow.status).toBe("ready");
    expect(assetRow.expiresAt).toBeNull();

    // Verify junction row in submission_assets
    const [subAsset] = await db
      .select()
      .from(submissionAssets)
      .where(
        and(
          eq(submissionAssets.submissionVersionId, draftVersionId!),
          eq(submissionAssets.creativeAssetId, createdAssetId!)
        )
      )
      .limit(1);

    expect(subAsset).toBeDefined();
    expect(subAsset.creativeAssetId).toBe(createdAssetId);
  });

  it("4. Authoritative Content Detail DTO returns newly attached creative asset", async () => {
    const detail = await getAuthoritativeContentItemDetailAction(
      projectId,
      contentItemId,
      designerId
    );

    expect(detail.success).toBe(true);
    expect(detail.data).toBeDefined();

    const versions = detail.data!.itemVersions;
    expect(versions.length).toBeGreaterThan(0);

    const activeDraft = versions.find((v) => v.id === draftVersionId);
    expect(activeDraft).toBeDefined();
    expect(activeDraft!.creativeAssets.length).toBe(1);

    const asset = activeDraft!.creativeAssets[0];
    expect(asset.assetId).toBe(createdAssetId);
    expect(asset.filename).toBe("hero-creative.png");
    expect(asset.previewUrl).toContain(`/api/assets/${createdAssetId}/preview`);
  });

  it("5. Removing creative asset detaches it from draft version", async () => {
    const removeRes = await removeCreativeAssetFromSubmissionAction({
      assetId: createdAssetId!,
      submissionVersionId: draftVersionId!,
      actorUserId: designerId,
    });

    expect(removeRes.success).toBe(true);

    const detailAfter = await getAuthoritativeContentItemDetailAction(
      projectId,
      contentItemId,
      designerId
    );

    const activeDraft = detailAfter.data!.itemVersions.find((v) => v.id === draftVersionId);
    expect(activeDraft!.creativeAssets.length).toBe(0);
  });
});
