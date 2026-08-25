import { db } from "../db";
import { creativeAssets, submissionAssets, submissionVersions, contentItems, projects } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveProjectId } from "../compat/resolver";
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  validateMimeAndExtension,
  MAX_UPLOAD_SIZE_BYTES,
} from "../storage/r2";

/**
 * 1. Request Upload URL (Creates pending creative_asset record and returns presigned PUT URL)
 */
export async function requestAssetUploadUrlAction(params: {
  actorUserId: string;
  projectId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string;
}) {
  const { actorUserId, projectId, filename, mimeType, fileSizeBytes, contentHash } = params;

  if (fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return { success: false, error: `File size exceeds maximum limit of 100 MB (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB).` };
  }

  const { valid, error } = validateMimeAndExtension(filename, mimeType);
  if (!valid) {
    return { success: false, error };
  }

  const resolvedProjId = await resolveProjectId(projectId);
  if (!resolvedProjId) return { success: false, error: "Project not found." };

  const access = await requireProjectAccess(actorUserId, resolvedProjId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot upload creative assets." };
  }

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Actor not found." };

  const legacyAssetId = generateLegacyId("asset");
  const assetUuid = crypto.randomUUID();

  // Generate presigned upload URL
  const { presignedUrl, objectKey } = await generatePresignedUploadUrl({
    orgId: actor.orgId,
    projectId: resolvedProjId,
    assetId: assetUuid,
    filename,
    mimeType,
  });

  // Create pending asset record with 15-minute expiry
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const [asset] = await db
    .insert(creativeAssets)
    .values({
      id: assetUuid,
      legacyId: legacyAssetId,
      projectId: resolvedProjId,
      orgId: actor.orgId,
      r2ObjectKey: objectKey,
      originalFilename: filename,
      fileSizeBytes,
      mimeType,
      contentHash,
      uploadedByUserId: actor.id,
      status: "pending",
      expiresAt,
    })
    .returning();

  return { success: true, asset, presignedUrl, objectKey };
}

/**
 * 2. Confirm Upload (Verifies upload and marks creative_asset as ready, optionally attaching to draft version)
 */
export async function confirmAssetUploadAction(params: {
  actorUserId: string;
  assetId: string;
  submissionVersionId?: string;
  sortOrder?: number;
}) {
  const { actorUserId, assetId, submissionVersionId, sortOrder } = params;

  const [asset] = await db
    .select()
    .from(creativeAssets)
    .where(eq(creativeAssets.id, assetId))
    .limit(1);

  if (!asset) return { success: false, error: "Asset intent record not found." };

  const access = await requireProjectAccess(actorUserId, asset.projectId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot confirm asset uploads." };
  }

  // Update status to 'ready'
  const [updatedAsset] = await db
    .update(creativeAssets)
    .set({
      status: "ready",
      expiresAt: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(creativeAssets.id, asset.id))
    .returning();

  // If submissionVersionId provided, attach to draft version
  if (submissionVersionId) {
    const [version] = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.id, submissionVersionId))
      .limit(1);

    if (version) {
      if (!version.isDraft) {
        return { success: false, error: "Immutable Submission: Cannot attach assets to an already submitted version." };
      }

      await db
        .insert(submissionAssets)
        .values({
          submissionVersionId: version.id,
          creativeAssetId: updatedAsset.id,
          sortOrder: sortOrder || 0,
        })
        .onConflictDoNothing();
    }
  }

  return { success: true, asset: updatedAsset };
}

/**
 * 3. Authorized Download / Preview URL Generator
 * Strictly evaluates the Client Eligibility Chain:
 * CreativeAsset -> SubmissionAsset -> Client-Eligible SubmissionVersion -> client_visible ContentItem -> Client Membership
 */
export async function getAuthorizedAssetDownloadUrlAction(params: {
  actorUserId: string;
  assetId: string;
  inline?: boolean;
}) {
  const { actorUserId, assetId, inline } = params;

  const [asset] = await db
    .select()
    .from(creativeAssets)
    .where(eq(creativeAssets.id, assetId))
    .limit(1);

  if (!asset || asset.status !== "ready") {
    return { success: false, error: "Asset not found or upload not confirmed." };
  }

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  // Internal users (founder, admin, consultant, designer)
  if (actor.organizationRole !== "client") {
    const access = await requireProjectAccess(actor.id, asset.projectId);
    if (!access.allowed) {
      return { success: false, error: "Unauthorized: You do not have access to this project's assets." };
    }
  } else {
    // Client user: Evaluate full client eligibility chain
    const clientEligible = await db
      .select({ id: submissionAssets.id })
      .from(submissionAssets)
      .innerJoin(submissionVersions, eq(submissionAssets.submissionVersionId, submissionVersions.id))
      .innerJoin(contentItems, eq(submissionVersions.contentItemId, contentItems.id))
      .where(
        and(
          eq(submissionAssets.creativeAssetId, asset.id),
          eq(submissionVersions.isDraft, false),
          eq(contentItems.clientVisible, true),
          eq(contentItems.status, "active"),
          eq(contentItems.projectId, asset.projectId)
        )
      )
      .limit(1);

    if (clientEligible.length === 0) {
      return {
        success: false,
        error: "Unauthorized: Client cannot access draft, rejected, or internal creative assets.",
      };
    }
  }

  // Generate 5-minute presigned download URL
  const downloadUrl = await generatePresignedDownloadUrl({
    objectKey: asset.r2ObjectKey,
    filename: asset.originalFilename,
    mimeType: asset.mimeType,
    expiresInSeconds: 300,
    inline: inline !== undefined ? inline : true,
  });

  return { success: true, downloadUrl, filename: asset.originalFilename, mimeType: asset.mimeType };
}
