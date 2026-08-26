"use server";

import { db, runTransaction } from "../db";
import { comments, annotations, externalReviewTokens, auditRecords, notifications, submissionVersions, contentItems, projects, creativeAssets } from "../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveSubmissionVersionId, resolveContentItemId } from "../compat/resolver";
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

  // Fetch only the explicitly shared submission version & assets
  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, record.submissionVersionId))
    .limit(1);

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

  return {
    success: true,
    tokenRecord: record,
    contentItem: item,
    submissionVersion: version,
    allowDownload: record.allowDownload,
  };
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
