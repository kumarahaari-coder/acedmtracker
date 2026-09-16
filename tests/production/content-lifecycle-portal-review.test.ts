import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import {
  contentItems,
  submissionVersions,
  projects,
  projectMemberships,
  users,
  externalReviewTokens,
  creativeAssets,
  submissionAssets,
} from "../../lib/db/schema";
import {
  getAuthoritativeActiveDraftAction,
  saveDraftVersionAction,
  submitVersionAction,
  createNewVersionDraftAction,
  toggleClientVisibilityAction,
  updateContentItemStageAction,
} from "../../lib/actions/content";
import {
  getAuthoritativeClientOverviewAction,
} from "../../lib/actions/clientPortal";
import {
  generateExternalReviewTokenAction,
  verifyExternalReviewTokenAction,
  revokeExternalReviewTokenAction,
  postExternalReviewCommentAction,
} from "../../lib/actions/collaboration";
import { eq, and, desc } from "drizzle-orm";

import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("Production Content Lifecycle, Client Portal & External Guest Review E2E", () => {
  let founderUser: any;
  let clientUser: any;
  let testProject: any;
  let testItem: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    // 1. Resolve Founder User
    const [founder] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationRole, "founder"), eq(users.status, "active")))
      .limit(1);
    founderUser = founder;

    // 2. Resolve Client User & Project
    const [project] = await db.select().from(projects).limit(1);
    testProject = project;

    const [clientMem] = await db
      .select()
      .from(projectMemberships)
      .where(and(eq(projectMemberships.projectId, testProject.id), eq(projectMemberships.membershipRole, "client")))
      .limit(1);

    if (clientMem) {
      const [u] = await db.select().from(users).where(eq(users.id, clientMem.userId)).limit(1);
      clientUser = u;
    } else {
      clientUser = founderUser; // fallback
    }

    // 3. Create fresh test ContentItem in PostgreSQL
    const [newItem] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        legacyId: `item_${Math.random().toString(36).substring(2, 9)}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        title: `E2E Lifecycle Test Item (${Date.now()})`,
        platform: "Instagram",
        contentType: "post",
        stage: "draft",
        clientVisible: false,
        currentVersionNumber: 1,
      })
      .returning();

    testItem = newItem;
  });

  it("1. Resolves V1 draft, saves copy updates, and verifies persistence in PostgreSQL", async () => {
    // Resolve active draft (creates V1 if none exists)
    const draftRes = await getAuthoritativeActiveDraftAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
    });
    expect(draftRes.success).toBe(true);
    expect(draftRes.draft).toBeDefined();
    expect(draftRes.draft!.versionNumber).toBe(1);
    expect(draftRes.draft!.isDraft).toBe(true);

    const v1DraftId = draftRes.draft!.id;

    // Save copy updates
    const saveRes = await saveDraftVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: v1DraftId,
      updates: {
        caption: "V1 Test Caption",
        hashtags: ["v1", "test"],
        cta: "Click V1 Link",
      },
    });
    expect(saveRes.success).toBe(true);

    // Attach creative asset to satisfy submission requirement
    const [ca] = await db
      .insert(creativeAssets)
      .values({
        id: crypto.randomUUID(),
        projectId: testProject.id,
        orgId: founderUser.orgId,
        r2ObjectKey: `test/portal_${Date.now()}`,
        originalFilename: "portal_creative.png",
        fileSizeBytes: 2048,
        mimeType: "image/png",
        contentHash: "hash_portal_" + Math.random().toString(36),
        uploadedByUserId: founderUser.id,
        status: "ready",
      })
      .returning();

    await db.insert(submissionAssets).values({
      submissionVersionId: v1DraftId,
      creativeAssetId: ca.id,
    });

    // Verify persistence in PostgreSQL
    const [dbVer] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, v1DraftId));
    expect(dbVer.caption).toBe("V1 Test Caption");
    expect(dbVer.cta).toBe("Click V1 Link");
    expect(dbVer.isDraft).toBe(true);
  });

  it("2. Submits V1 for review (freezes V1 draft and sets stage to in_review)", async () => {
    const draftRes = await getAuthoritativeActiveDraftAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
    });
    expect(draftRes.draft).toBeDefined();

    const submitRes = await submitVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: draftRes.draft!.id,
    });
    expect(submitRes.success).toBe(true);

    // Verify frozen state in PostgreSQL
    const [dbVer] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, draftRes.draft!.id));
    expect(dbVer.isDraft).toBe(false);
    expect(dbVer.submittedAt).not.toBeNull();

    const [dbItem] = await db.select().from(contentItems).where(eq(contentItems.id, testItem.id));
    expect(dbItem.stage).toBe("in_review");
  });

  it("3. Creates V2 revision draft after change request, saves V2, and submits V2", async () => {
    // Set stage to changes_requested
    await updateContentItemStageAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      stage: "changes_requested",
    });

    // Create V2 Draft
    const v2DraftRes = (await createNewVersionDraftAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
    })) as any;
    expect(v2DraftRes.success).toBe(true);
    expect(v2DraftRes.version.versionNumber).toBe(2);
    expect(v2DraftRes.version.isDraft).toBe(true);

    const v2DraftId = v2DraftRes.version.id;

    // Save V2 copy
    await saveDraftVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: v2DraftId,
      updates: {
        caption: "V2 Revised Caption",
        hashtags: ["v2", "revised"],
        cta: "Click V2 Link",
      },
    });

    // Submit V2
    const submitV2Res = await submitVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: v2DraftId,
    });
    expect(submitV2Res.success).toBe(true);

    const [dbV2] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, v2DraftId));
    expect(dbV2.isDraft).toBe(false);
    expect(dbV2.caption).toBe("V2 Revised Caption");
  });

  it("4. Approves item and explicitly sets client_visible = true in PostgreSQL", async () => {
    // Approve deliverable stage
    await updateContentItemStageAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      stage: "approved",
    });

    // Explicitly toggle client visibility ON
    const toggleRes = await toggleClientVisibilityAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      clientVisible: true,
    });
    expect(toggleRes.success).toBe(true);

    const [dbItem] = await db.select().from(contentItems).where(eq(contentItems.id, testItem.id));
    expect(dbItem.clientVisible).toBe(true);
    expect(dbItem.stage).toBe("approved");
  });

  it("5. Verifies Client Portal queries PostgreSQL directly and shows V2 content with matching count cards", async () => {
    const portalRes = await getAuthoritativeClientOverviewAction(testProject.id, clientUser.id);
    expect(portalRes.success).toBe(true);
    expect(portalRes.data).toBeDefined();

    const overview = portalRes.data!;
    expect(overview.summary.totalCreatives).toBeGreaterThanOrEqual(1);
    expect(overview.summary.approvedCount).toBeGreaterThanOrEqual(1);

    // Verify item is present in recentCreatives showing V2 copy
    const portalItem = overview.recentCreatives.find((c) => c.id === testItem.id);
    expect(portalItem).toBeDefined();
    expect(portalItem?.copy.caption).toBe("V2 Revised Caption");
  });

  it("6. Generates Guest Review Token for V2, verifies Incognito resolution, and verifies V2 immutability when V3 is created", async () => {
    // Get V2 submitted version ID
    const [v2Ver] = await db
      .select()
      .from(submissionVersions)
      .where(and(eq(submissionVersions.contentItemId, testItem.id), eq(submissionVersions.versionNumber, 2)));

    // Generate External Review Link for V2
    const tokenRes = await generateExternalReviewTokenAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      submissionVersionId: v2Ver.id,
      allowDownload: true,
      expiresInDays: 7,
    });
    expect(tokenRes.success).toBe(true);
    expect(tokenRes.rawToken).toBeDefined();

    const rawToken = tokenRes.rawToken!;
    const tokenId = tokenRes.tokenRecord!.id;

    // Verify token resolution in Incognito context (no Auth.js user)
    const verifyRes = await verifyExternalReviewTokenAction(rawToken);
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.submissionVersion!.caption).toBe("V2 Revised Caption");

    // Post guest comment
    const commentRes = await postExternalReviewCommentAction({
      rawToken,
      guestName: "External Reviewer",
      commentBody: "V2 Looks great!",
    });
    expect(commentRes.success).toBe(true);

    // Create V3 internally
    await updateContentItemStageAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
      stage: "changes_requested",
    });

    const v3Res = (await createNewVersionDraftAction({
      actorUserId: founderUser.id,
      contentItemId: testItem.id,
    })) as any;
    expect(v3Res.success).toBe(true);

    await saveDraftVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: v3Res.version.id,
      updates: { caption: "V3 Internal Draft Caption" },
    });

    // Verify original guest review link STILL resolves V2 (immutable binding)
    const reVerifyRes = await verifyExternalReviewTokenAction(rawToken);
    expect(reVerifyRes.success).toBe(true);
    expect(reVerifyRes.submissionVersion!.caption).toBe("V2 Revised Caption");

    // Revoke token
    const revokeRes = await revokeExternalReviewTokenAction({
      actorUserId: founderUser.id,
      tokenId,
    });
    expect(revokeRes.success).toBe(true);

    // Verify link is now invalid
    const revokedVerifyRes = await verifyExternalReviewTokenAction(rawToken);
    expect(revokedVerifyRes.success).toBe(false);
    expect(revokedVerifyRes.error).toContain("revoked");
  });
});
