"use server";

import { db, runTransaction } from "../db";
import { comments, annotations, externalReviewTokens, auditRecords, notifications, submissionVersions, contentItems, projects, creativeAssets, submissionAssets, campaigns } from "../db/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveSubmissionVersionId, resolveContentItemId, resolveProjectId, resolveUserId } from "../compat/resolver";
import { invalidateWorkspaceEntities } from "./revalidation";
import { generatePresignedDownloadUrl } from "../storage/r2";
import crypto from "node:crypto";

/**
 * 1. Create Comment Action (Internal or External visibility)
 */
export async function createCommentAction(params: {
  actorUserId?: string;
  externalReviewerName?: string;
  projectId: string;
  contentItemId: string;
  submissionVersionId?: string;
  parentCommentId?: string;
  body: string;
  visibility?: "internal" | "external";
}) {
  const { actorUserId, externalReviewerName, projectId, contentItemId, submissionVersionId, parentCommentId, body, visibility = "internal" } = params;

  let authorId: string | null = null;
  let orgId: string = "";

  if (actorUserId) {
    const actor = await getAuthoritativeUser(actorUserId);
    if (!actor) return { success: false, error: "Unauthorized." };
    authorId = actor.id;
    orgId = actor.orgId;
  } else {
    // External Reviewer path
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return { success: false, error: "Project not found." };
    orgId = project.orgId;
  }

  const [comment] = await db
    .insert(comments)
    .values({
      legacyId: generateLegacyId("comm"),
      projectId,
      orgId,
      contentItemId,
      submissionVersionId: submissionVersionId || null,
      parentCommentId: parentCommentId || null,
      authorUserId: authorId,
      externalReviewerName: externalReviewerName || null,
      visibility,
      body,
    })
    .returning();

  return { success: true, comment };
}

/**
 * 2. Create Visual Annotation Action
 */
export async function createAnnotationAction(params: {
  commentId: string;
  projectId: string;
  orgId: string;
  assetId: string;
  type: "point" | "region" | "video_timestamp" | "pdf_page";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  timestampSeconds?: number;
  pageNumber?: number;
}) {
  const [annotation] = await db
    .insert(annotations)
    .values({
      legacyId: generateLegacyId("annot"),
      commentId: params.commentId,
      projectId: params.projectId,
      orgId: params.orgId,
      assetId: params.assetId,
      type: params.type,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      timestampSeconds: params.timestampSeconds,
      pageNumber: params.pageNumber,
    })
    .returning();

  return { success: true, annotation };
}

/**
 * 3. Create External Review Token Action
 * Tokenized, expiring, revocable link with scoped access.
 * Designers cannot generate external review links.
 */
export async function createExternalReviewTokenAction(params: {
  actorUserId: string;
  contentItemId: string;
  submissionVersionId: string;
  expiresInDays?: number;
  allowDownload?: boolean;
}) {
  const { actorUserId, contentItemId, submissionVersionId, expiresInDays = 7, allowDownload = false } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  // Designers and Clients CANNOT create external review links
  if (actor.organizationRole === "designer" || actor.organizationRole === "client") {
    return { success: false, error: "Unauthorized: Designers cannot create External Review links." };
  }

  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, submissionVersionId))
    .limit(1);

  if (!version) return { success: false, error: "Submission version not found." };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000);

  const [tokenRecord] = await db
    .insert(externalReviewTokens)
    .values({
      legacyId: generateLegacyId("tok"),
      projectId: version.projectId,
      orgId: version.orgId,
      contentItemId: version.contentItemId,
      submissionVersionId: version.id,
      tokenHash,
      allowDownload,
      expiresAt,
      createdByUserId: actor.id,
    })
    .returning();

  return {
    success: true,
    tokenRecord,
    rawToken,
    reviewUrl: `/guest/review/${rawToken}`,
  };
}

export { createExternalReviewTokenAction as generateExternalReviewTokenAction };

/**
 * 4. Verify External Review Token Action
 * Scoped sandbox resolution without exposing internal users, assignments, or comments.
 */
export async function verifyExternalReviewTokenAction(rawToken: string) {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const [record] = await db
    .select()
    .from(externalReviewTokens)
    .where(
      and(
        eq(externalReviewTokens.tokenHash, tokenHash),
        sql`${externalReviewTokens.revokedAt} IS NULL`,
        sql`${externalReviewTokens.expiresAt} > NOW()`
      )
    )
    .limit(1);

  if (!record) return { success: false, error: "Review link is invalid, expired, or revoked." };

  // Fetch only the explicitly shared submission version
  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, record.submissionVersionId))
    .limit(1);

  if (!version) return { success: false, error: "Shared submission version no longer exists." };

  const [item] = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      platform: contentItems.platform,
      contentType: contentItems.contentType,
    })
    .from(contentItems)
    .where(eq(contentItems.id, record.contentItemId))
    .limit(1);

  // Fetch attached creative assets strictly scoped to this token-bound submission version
  const rawAttachedAssets = await db
    .select({
      id: creativeAssets.id,
      r2ObjectKey: creativeAssets.r2ObjectKey,
      originalFilename: creativeAssets.originalFilename,
      fileSizeBytes: creativeAssets.fileSizeBytes,
      mimeType: creativeAssets.mimeType,
      status: creativeAssets.status,
      sortOrder: submissionAssets.sortOrder,
    })
    .from(submissionAssets)
    .innerJoin(creativeAssets, eq(submissionAssets.creativeAssetId, creativeAssets.id))
    .where(eq(submissionAssets.submissionVersionId, record.submissionVersionId))
    .orderBy(asc(submissionAssets.sortOrder));

  const eligibleAssets = rawAttachedAssets.filter((a) => a.status === "ready");

  const mappedAssets = await Promise.all(
    eligibleAssets.map(async (asset) => {
      const isPdf = asset.mimeType === "application/pdf" || asset.originalFilename.toLowerCase().endsWith(".pdf");
      const previewUrl = await generatePresignedDownloadUrl({
        objectKey: asset.r2ObjectKey,
        filename: asset.originalFilename,
        mimeType: asset.mimeType,
        inline: true,
      });

      return {
        assetId: asset.id,
        filename: asset.originalFilename,
        mimeType: asset.mimeType,
        fileSizeBytes: asset.fileSizeBytes,
        previewUrl,
        sortOrder: asset.sortOrder,
        isPdf,
      };
    })
  );

  // Fetch external comments for this version
  const versionComments = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.submissionVersionId, record.submissionVersionId),
        eq(comments.visibility, "external")
      )
    )
    .orderBy(desc(comments.createdAt));

  const mappedVersion = {
    id: version.id,
    contentItemId: version.contentItemId,
    projectId: version.projectId,
    versionNumber: version.versionNumber,
    isDraft: version.isDraft,
    submittedAt: version.submittedAt ? version.submittedAt.toISOString() : null,
    caption: version.caption || "",
    hashtags: version.hashtags || [],
    cta: version.cta || "",
    destinationUrl: version.destinationUrl || null,
    copy: {
      caption: version.caption || "",
      hashtags: version.hashtags || [],
      cta: version.cta || "",
      destinationUrl: version.destinationUrl || null,
    },
    creativeAssets: mappedAssets,
  };

  return {
    success: true,
    tokenRecord: record,
    contentItem: item,
    submissionVersion: mappedVersion,
    allowDownload: record.allowDownload,
    comments: versionComments,
  };
}

/**
 * 4b. Guest Authorized Asset Download URL Action
 * Verifies token validity and proves asset is attached to the token-bound submission version.
 * Does not require Auth.js login.
 */
export async function getGuestAuthorizedAssetDownloadUrlAction(params: {
  rawToken: string;
  assetId: string;
  inline?: boolean;
}) {
  const { rawToken, assetId, inline = false } = params;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const [record] = await db
    .select()
    .from(externalReviewTokens)
    .where(
      and(
        eq(externalReviewTokens.tokenHash, tokenHash),
        sql`${externalReviewTokens.revokedAt} IS NULL`,
        sql`${externalReviewTokens.expiresAt} > NOW()`
      )
    )
    .limit(1);

  if (!record) return { success: false, error: "Review link is invalid, expired, or revoked." };

  // Verify that the requested asset is attached to the exact submission version bound to this token
  const [attached] = await db
    .select({ id: submissionAssets.id })
    .from(submissionAssets)
    .where(
      and(
        eq(submissionAssets.submissionVersionId, record.submissionVersionId),
        eq(submissionAssets.creativeAssetId, assetId)
      )
    )
    .limit(1);

  if (!attached) {
    return { success: false, error: "Unauthorized: Asset not attached to this review version." };
  }

  const [asset] = await db
    .select()
    .from(creativeAssets)
    .where(eq(creativeAssets.id, assetId))
    .limit(1);

  if (!asset || asset.status !== "ready") {
    return { success: false, error: "Asset not found or not ready." };
  }

  const downloadUrl = await generatePresignedDownloadUrl({
    objectKey: asset.r2ObjectKey,
    filename: asset.originalFilename,
    mimeType: asset.mimeType,
    inline,
  });

  return {
    success: true,
    downloadUrl,
    filename: asset.originalFilename,
    mimeType: asset.mimeType,
  };
}

/**
 * Allows guest reviewer to post external comment
 */
export async function postExternalReviewCommentAction(params: {
  rawToken: string;
  guestName: string;
  commentBody: string;
}) {
  const { rawToken, guestName, commentBody } = params;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const [record] = await db
    .select()
    .from(externalReviewTokens)
    .where(
      and(
        eq(externalReviewTokens.tokenHash, tokenHash),
        sql`${externalReviewTokens.revokedAt} IS NULL`,
        sql`${externalReviewTokens.expiresAt} > NOW()`
      )
    )
    .limit(1);

  if (!record) return { success: false, error: "Review link is invalid, expired, or revoked." };

  const [newComment] = await db
    .insert(comments)
    .values({
      legacyId: generateLegacyId("comm"),
      orgId: record.orgId,
      projectId: record.projectId,
      contentItemId: record.contentItemId,
      submissionVersionId: record.submissionVersionId,
      externalReviewerName: guestName,
      visibility: "external",
      body: commentBody,
    })
    .returning();

  return { success: true, comment: newComment };
}

/**
 * Revokes an external review token
 */
export async function revokeExternalReviewTokenAction(params: {
  actorUserId: string;
  tokenId: string;
}) {
  const { actorUserId, tokenId } = params;
  const [record] = await db
    .select()
    .from(externalReviewTokens)
    .where(eq(externalReviewTokens.id, tokenId))
    .limit(1);

  if (!record) return { success: false, error: "Token record not found." };

  const access = await requireProjectAccess(actorUserId, record.projectId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized to revoke review token." };
  }

  const [updated] = await db
    .update(externalReviewTokens)
    .set({
      revokedAt: sql`NOW()`,
    })
    .where(eq(externalReviewTokens.id, record.id))
    .returning();

  return { success: true, tokenRecord: updated };
}

/**
 * 5. Log Audit Record Action (Immutable Ledger)
 */
export async function logAuditRecordAction(params: {
  orgId: string;
  projectId?: string;
  actorUserId?: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  reason?: string;
  beforeState?: any;
  afterState?: any;
}) {
  const [record] = await db
    .insert(auditRecords)
    .values({
      orgId: params.orgId,
      projectId: params.projectId || null,
      actorUserId: params.actorUserId || null,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      summary: params.summary,
      reason: params.reason || null,
      beforeState: params.beforeState || null,
      afterState: params.afterState || null,
    })
    .returning();

  return { success: true, record };
}

/**
 * 6. Authoritative Campaign Management Actions (PostgreSQL-backed)
 */
export async function createCampaignAction(params: {
  projectId: string;
  name: string;
  objective?: string;
  description?: string;
  status?: "planning" | "active" | "completed" | "paused";
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  actorUserId?: string;
}): Promise<{
  success: boolean;
  campaign?: {
    id: string;
    projectId: string;
    name: string;
    objective: string;
    description: string;
    status: string;
    startDate?: string;
    endDate?: string;
    ownerId: string;
  };
  error?: string;
}> {
  try {
    const canonicalProjectId = await resolveProjectId(params.projectId);
    if (!canonicalProjectId) return { success: false, error: "Project not found in database." };

    const [proj] = await db.select().from(projects).where(eq(projects.id, canonicalProjectId)).limit(1);
    if (!proj) return { success: false, error: "Project record not found." };

    let ownerUserId: string | null = null;
    if (params.ownerId) {
      ownerUserId = await resolveUserId(params.ownerId);
    } else if (params.actorUserId) {
      ownerUserId = await resolveUserId(params.actorUserId);
    }

    const [created] = await db
      .insert(campaigns)
      .values({
        projectId: canonicalProjectId,
        orgId: proj.orgId,
        name: params.name.trim(),
        objective: (params.objective || "").trim(),
        description: (params.description || "").trim(),
        status: params.status || "planning",
        startDate: params.startDate ? new Date(params.startDate) : null,
        endDate: params.endDate ? new Date(params.endDate) : null,
        ownerId: ownerUserId || null,
      })
      .returning();

    await invalidateWorkspaceEntities({
      projectId: canonicalProjectId,
      orgId: proj.orgId,
      paths: [`/projects/${canonicalProjectId}`, "/projects"],
    });

    return {
      success: true,
      campaign: {
        id: created.id,
        projectId: created.projectId,
        name: created.name,
        objective: created.objective,
        description: created.description,
        status: created.status,
        startDate: created.startDate ? created.startDate.toISOString() : undefined,
        endDate: created.endDate ? created.endDate.toISOString() : undefined,
        ownerId: created.ownerId || params.actorUserId || "u_founder",
      },
    };
  } catch (err: any) {
    console.error("Failed to create campaign in database:", err);
    return { success: false, error: err.message || "Failed to create campaign." };
  }
}

export async function updateCampaignAction(params: {
  campaignId: string;
  name?: string;
  objective?: string;
  description?: string;
  status?: "planning" | "active" | "completed" | "paused";
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  actorUserId?: string;
}) {
  try {
    const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, params.campaignId)).limit(1);
    if (!existing) return { success: false, error: "Campaign not found." };

    let ownerUserId: string | null = existing.ownerId;
    if (params.ownerId) {
      ownerUserId = await resolveUserId(params.ownerId);
    }

    const [updated] = await db
      .update(campaigns)
      .set({
        name: params.name !== undefined ? params.name.trim() : existing.name,
        objective: params.objective !== undefined ? params.objective.trim() : existing.objective,
        description: params.description !== undefined ? params.description.trim() : existing.description,
        status: params.status || existing.status,
        startDate: params.startDate !== undefined ? (params.startDate ? new Date(params.startDate) : null) : existing.startDate,
        endDate: params.endDate !== undefined ? (params.endDate ? new Date(params.endDate) : null) : existing.endDate,
        ownerId: ownerUserId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(campaigns.id, existing.id))
      .returning();

    await invalidateWorkspaceEntities({
      projectId: existing.projectId,
      orgId: existing.orgId,
      paths: [`/projects/${existing.projectId}`],
    });

    return { success: true, campaign: updated };
  } catch (err: any) {
    console.error("Failed to update campaign:", err);
    return { success: false, error: err.message || "Failed to update campaign." };
  }
}

export async function deleteCampaignAction(campaignId: string) {
  try {
    const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!existing) return { success: false, error: "Campaign not found." };

    await db.delete(campaigns).where(eq(campaigns.id, campaignId));

    await invalidateWorkspaceEntities({
      projectId: existing.projectId,
      orgId: existing.orgId,
      paths: [`/projects/${existing.projectId}`],
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete campaign:", err);
    return { success: false, error: err.message || "Failed to delete campaign." };
  }
}

