"use server";

import { db, runTransaction } from "../db";
import {
  contentGroups,
  contentItems,
  submissionVersions,
  projects,
  ContentPlatform,
  ContentType,
  ScopeClassification,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveProjectId, resolveContentItemId } from "../compat/resolver";

// Helper for computing fingerprints
function computeFingerprints(copy: { caption: string; hashtags: string[]; cta: string; destinationUrl?: string }, scheduledDate?: string) {
  const copyStr = `${copy.caption}|${copy.hashtags.join(",")}|${copy.cta}|${copy.destinationUrl || ""}`;
  const dateStr = scheduledDate || "unscheduled";
  return {
    copyFingerprint: "fp_copy_" + Buffer.from(copyStr).toString("base64").substring(0, 16),
    creativeFingerprint: "fp_creative_default",
    postingDateFingerprint: "fp_date_" + Buffer.from(dateStr).toString("base64").substring(0, 16),
  };
}

/**
 * 1. Create Standalone Content Item + V1 Draft
 */
export async function createContentItemAction(params: {
  actorUserId: string;
  projectId: string;
  title: string;
  platform: ContentPlatform;
  contentType: ContentType;
  scopeClassification?: ScopeClassification;
  scheduledPublicationDate?: string;
  submissionDeadline?: string;
  initialCopy?: { caption: string; hashtags: string[]; cta: string; destinationUrl?: string };
}) {
  const { actorUserId, projectId, title, platform, contentType, scopeClassification, scheduledPublicationDate, submissionDeadline, initialCopy } = params;

  const resolvedProjId = await resolveProjectId(projectId);
  if (!resolvedProjId) return { success: false, error: "Project not found." };

  const access = await requireProjectAccess(actorUserId, resolvedProjId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot create content." };
  }

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Actor not found." };

  const legacyItemId = generateLegacyId("item");
  const legacyVerId = generateLegacyId("ver");

  const copy = initialCopy || { caption: `Draft copy for ${title}`, hashtags: [], cta: "" };
  const fingerprints = computeFingerprints(copy, scheduledPublicationDate);

  // Insert ContentItem
  const [item] = await db
    .insert(contentItems)
    .values({
      legacyId: legacyItemId,
      projectId: resolvedProjId,
      orgId: actor.orgId,
      title,
      platform,
      contentType,
      stage: "draft",
      scopeClassification: scopeClassification || "contracted",
      clientVisible: false,
      scheduledPublicationDate: scheduledPublicationDate ? new Date(scheduledPublicationDate) : null,
      submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null,
      currentVersionNumber: 1,
    })
    .returning();

  // Insert V1 Draft
  const [version] = await db
    .insert(submissionVersions)
    .values({
      legacyId: legacyVerId,
      contentItemId: item.id,
      projectId: resolvedProjId,
      orgId: actor.orgId,
      versionNumber: 1,
      isDraft: true,
      caption: copy.caption,
      hashtags: copy.hashtags,
      cta: copy.cta,
      destinationUrl: copy.destinationUrl,
      scheduledDate: scheduledPublicationDate ? new Date(scheduledPublicationDate) : null,
      copyFingerprint: fingerprints.copyFingerprint,
      creativeFingerprint: fingerprints.creativeFingerprint,
      postingDateFingerprint: fingerprints.postingDateFingerprint,
      createdByUserId: actor.id,
    })
    .returning();

  return { success: true, item, version };
}

/**
 * 2. Create Multi-Platform Content Group + N Content Items + N V1 Drafts (Atomic Transaction)
 */
export async function createContentGroupAction(params: {
  actorUserId: string;
  projectId: string;
  title: string;
  description?: string;
  conceptNotes?: string;
  platforms: Array<{
    platform: ContentPlatform;
    contentType: ContentType;
    scheduledPublicationDate?: string;
    submissionDeadline?: string;
  }>;
  sharedInitialCopy?: { caption: string; hashtags: string[]; cta: string; destinationUrl?: string };
}) {
  const { actorUserId, projectId, title, description, conceptNotes, platforms, sharedInitialCopy } = params;

  if (!platforms || platforms.length === 0) {
    return { success: false, error: "At least one platform item must be specified." };
  }

  const resolvedProjId = await resolveProjectId(projectId);
  if (!resolvedProjId) return { success: false, error: "Project not found." };

  const access = await requireProjectAccess(actorUserId, resolvedProjId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot create content groups." };
  }

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Actor not found." };

  const legacyGroupId = generateLegacyId("grp");
  const copy = sharedInitialCopy || { caption: "", hashtags: [], cta: "" };

  // Run in single atomic transaction
  try {
    const result = await runTransaction(async (tx) => {
      // 1. Insert Group
      const [group] = await tx
        .insert(contentGroups)
        .values({
          legacyId: legacyGroupId,
          projectId: resolvedProjId,
          orgId: actor.orgId,
          title,
          description,
          conceptNotes,
          createdByUserId: actor.id,
        })
        .returning();

      const createdItems = [];
      const createdVersions = [];

      // 2. Insert child items and V1 drafts
      for (const p of platforms) {
        const legacyItemId = generateLegacyId("item");
        const legacyVerId = generateLegacyId("ver");
        const fingerprints = computeFingerprints(copy, p.scheduledPublicationDate);

        const [item] = await tx
          .insert(contentItems)
          .values({
            legacyId: legacyItemId,
            projectId: resolvedProjId,
            orgId: actor.orgId,
            contentGroupId: group.id,
            title: `${title} (${p.platform})`,
            platform: p.platform,
            contentType: p.contentType,
            stage: "draft",
            scopeClassification: "contracted",
            clientVisible: false,
            scheduledPublicationDate: p.scheduledPublicationDate ? new Date(p.scheduledPublicationDate) : null,
            submissionDeadline: p.submissionDeadline ? new Date(p.submissionDeadline) : null,
            currentVersionNumber: 1,
          })
          .returning();

        const [version] = await tx
          .insert(submissionVersions)
          .values({
            legacyId: legacyVerId,
            contentItemId: item.id,
            projectId: resolvedProjId,
            orgId: actor.orgId,
            versionNumber: 1,
            isDraft: true,
            caption: copy.caption,
            hashtags: copy.hashtags,
            cta: copy.cta,
            destinationUrl: copy.destinationUrl,
            scheduledDate: p.scheduledPublicationDate ? new Date(p.scheduledPublicationDate) : null,
            copyFingerprint: fingerprints.copyFingerprint,
            creativeFingerprint: fingerprints.creativeFingerprint,
            postingDateFingerprint: fingerprints.postingDateFingerprint,
            createdByUserId: actor.id,
          })
          .returning();

        createdItems.push(item);
        createdVersions.push(version);
      }

      return { group, items: createdItems, versions: createdVersions };
    });

    return { success: true, ...result };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create content group transactionally." };
  }
}

/**
 * 3. Save Draft Submission Version (Designer/Internal action)
 */
export async function saveDraftVersionAction(params: {
  actorUserId: string;
  submissionVersionId: string;
  updates: {
    caption?: string;
    hashtags?: string[];
    cta?: string;
    destinationUrl?: string;
    scheduledDate?: string;
  };
}) {
  const { actorUserId, submissionVersionId, updates } = params;

  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, submissionVersionId))
    .limit(1);

  if (!version) return { success: false, error: "Submission version not found." };
  if (!version.isDraft) {
    return { success: false, error: "Immutable Submission: Submitted versions cannot be modified." };
  }

  const access = await requireProjectAccess(actorUserId, version.projectId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot save submission drafts." };
  }

  const newCaption = updates.caption !== undefined ? updates.caption : version.caption;
  const newHashtags = updates.hashtags !== undefined ? updates.hashtags : version.hashtags;
  const newCta = updates.cta !== undefined ? updates.cta : version.cta;
  const newDestUrl = updates.destinationUrl !== undefined ? updates.destinationUrl : version.destinationUrl;
  const newSchedDate = updates.scheduledDate !== undefined ? (updates.scheduledDate ? new Date(updates.scheduledDate) : null) : version.scheduledDate;

  const fingerprints = computeFingerprints(
    { caption: newCaption, hashtags: newHashtags, cta: newCta, destinationUrl: newDestUrl || undefined },
    newSchedDate ? newSchedDate.toISOString() : undefined
  );

  const [updated] = await db
    .update(submissionVersions)
    .set({
      caption: newCaption,
      hashtags: newHashtags,
      cta: newCta,
      destinationUrl: newDestUrl,
      scheduledDate: newSchedDate,
      copyFingerprint: fingerprints.copyFingerprint,
      creativeFingerprint: fingerprints.creativeFingerprint,
      postingDateFingerprint: fingerprints.postingDateFingerprint,
      updatedAt: sql`NOW()`,
    })
    .where(eq(submissionVersions.id, version.id))
    .returning();

  return { success: true, version: updated };
}

/**
 * 4. Submit Version (Freezes draft and advances stage to 'in_review')
 */
export async function submitVersionAction(params: {
  actorUserId: string;
  submissionVersionId: string;
}) {
  const { actorUserId, submissionVersionId } = params;

  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, submissionVersionId))
    .limit(1);

  if (!version) return { success: false, error: "Submission version not found." };
  if (!version.isDraft) return { success: true, version }; // Already submitted

  const access = await requireProjectAccess(actorUserId, version.projectId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot submit versions." };
  }

  const now = new Date();

  // Freeze version and advance contentItem stage in transaction
  const result = await runTransaction(async (tx) => {
    const [frozen] = await tx
      .update(submissionVersions)
      .set({
        isDraft: false,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(submissionVersions.id, version.id))
      .returning();

    const [item] = await tx
      .update(contentItems)
      .set({
        stage: "in_review",
        updatedAt: now,
      })
      .where(eq(contentItems.id, version.contentItemId))
      .returning();

    return { version: frozen, item };
  });

  return { success: true, ...result };
}

/**
 * 5. Create New Version Draft (Concurrency-Safe via parent row lock & draft invariant check)
 */
export async function createNewVersionDraftAction(params: {
  actorUserId: string;
  contentItemId: string;
  baseVersionId?: string;
}) {
  const { actorUserId, contentItemId, baseVersionId } = params;

  const resolvedItemId = await resolveContentItemId(contentItemId);
  if (!resolvedItemId) return { success: false, error: "Content item not found." };

  return runTransaction(async (tx) => {
    // 1. Lock parent ContentItem row for update
    const [item] = await tx
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, resolvedItemId))
      .for("update");

    if (!item) return { success: false, error: "Content item not found." };

    const access = await requireProjectAccess(actorUserId, item.projectId);
    if (!access.allowed || access.role === "client") {
      return { success: false, error: "Unauthorized: Clients cannot create new version drafts." };
    }

    // 2. Draft Invariant Check: Verify no existing active draft exists
    const existingDraft = await tx
      .select()
      .from(submissionVersions)
      .where(and(eq(submissionVersions.contentItemId, item.id), eq(submissionVersions.isDraft, true)))
      .limit(1);

    if (existingDraft.length > 0) {
      return {
        success: false,
        error: `Draft Invariant Violation: Version ${existingDraft[0].versionNumber} is already an active draft for this content item.`,
      };
    }

    // 3. Determine next version number
    const maxVersionResult = await tx
      .select({ maxVer: sql<number>`COALESCE(MAX(${submissionVersions.versionNumber}), 0)` })
      .from(submissionVersions)
      .where(eq(submissionVersions.contentItemId, item.id));

    const nextVerNum = (maxVersionResult[0]?.maxVer || item.currentVersionNumber || 0) + 1;

    // 4. Retrieve base copy if specified
    let copy = { caption: "", hashtags: [] as string[], cta: "", destinationUrl: undefined as string | undefined };
    let scheduledDate = item.scheduledPublicationDate;

    if (baseVersionId) {
      const [base] = await tx
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.id, baseVersionId))
        .limit(1);
      if (base) {
        copy = { caption: base.caption, hashtags: [...base.hashtags], cta: base.cta, destinationUrl: base.destinationUrl || undefined };
        scheduledDate = base.scheduledDate;
      }
    }

    const fingerprints = computeFingerprints(copy, scheduledDate ? scheduledDate.toISOString() : undefined);
    const legacyVerId = generateLegacyId("ver");

    // 5. Insert new Draft Version
    const [newVersion] = await tx
      .insert(submissionVersions)
      .values({
        legacyId: legacyVerId,
        contentItemId: item.id,
        projectId: item.projectId,
        orgId: item.orgId,
        versionNumber: nextVerNum,
        isDraft: true,
        caption: copy.caption,
        hashtags: copy.hashtags,
        cta: copy.cta,
        destinationUrl: copy.destinationUrl,
        scheduledDate,
        copyFingerprint: fingerprints.copyFingerprint,
        creativeFingerprint: fingerprints.creativeFingerprint,
        postingDateFingerprint: fingerprints.postingDateFingerprint,
        createdByUserId: actorUserId,
      })
      .returning();

    // 6. Update cached current_version_number on parent item
    await tx
      .update(contentItems)
      .set({
        currentVersionNumber: nextVerNum,
        updatedAt: sql`NOW()`,
      })
      .where(eq(contentItems.id, item.id));

    return { success: true, version: newVersion };
  });
}

/**
 * 6. Update Publishing Schedule (Restricted: Founder, Admin, Consultant)
 */
export async function updatePublishingScheduleAction(params: {
  actorUserId: string;
  contentItemId: string;
  scheduledPublicationDate: string | null;
  submissionDeadline?: string | null;
}) {
  const { actorUserId, contentItemId, scheduledPublicationDate, submissionDeadline } = params;

  const resolvedItemId = await resolveContentItemId(contentItemId);
  if (!resolvedItemId) return { success: false, error: "Content item not found." };

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, resolvedItemId))
    .limit(1);

  if (!item) return { success: false, error: "Content item not found." };

  const access = await requireProjectAccess(actorUserId, item.projectId);
  if (!access.allowed || access.role === "client" || access.role === "designer" || access.role === "video_editor") {
    return { success: false, error: "Unauthorized: Designers cannot modify scheduled publication dates." };
  }

  const [updated] = await db
    .update(contentItems)
    .set({
      scheduledPublicationDate: scheduledPublicationDate ? new Date(scheduledPublicationDate) : null,
      submissionDeadline: submissionDeadline !== undefined ? (submissionDeadline ? new Date(submissionDeadline) : null) : item.submissionDeadline,
      updatedAt: sql`NOW()`,
    })
    .where(eq(contentItems.id, item.id))
    .returning();

  return { success: true, item: updated };
}

/**
 * 7. Set Client Visibility (Restricted: Founder, Admin, Consultant)
 */
export async function setClientVisibilityAction(params: {
  actorUserId: string;
  contentItemId: string;
  clientVisible: boolean;
}) {
  const { actorUserId, contentItemId, clientVisible } = params;

  const resolvedItemId = await resolveContentItemId(contentItemId);
  if (!resolvedItemId) return { success: false, error: "Content item not found." };

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, resolvedItemId))
    .limit(1);

  if (!item) return { success: false, error: "Content item not found." };

  const access = await requireProjectAccess(actorUserId, item.projectId);
  if (!access.allowed || access.role === "client" || access.role === "designer" || access.role === "video_editor") {
    return { success: false, error: "Unauthorized: Designers cannot modify client visibility." };
  }

  const [updated] = await db
    .update(contentItems)
    .set({
      clientVisible,
      updatedAt: sql`NOW()`,
    })
    .where(eq(contentItems.id, item.id))
    .returning();

  return { success: true, item: updated };
}

/**
 * 8. Mark Content Published (Restricted: Founder, Admin, Consultant with strict https:// URL validation)
 */
export async function markContentPublishedAction(params: {
  actorUserId: string;
  contentItemId: string;
  liveUrl: string;
  publishedAt?: string;
}) {
  const { actorUserId, contentItemId, liveUrl, publishedAt } = params;

  // Strict URL Validation: Only https:// allowed (rejects javascript:, data:, http:)
  if (!/^https:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]+$/i.test(liveUrl)) {
    return { success: false, error: "Invalid URL: Published liveUrl must be a secure 'https://' address." };
  }

  const resolvedItemId = await resolveContentItemId(contentItemId);
  if (!resolvedItemId) return { success: false, error: "Content item not found." };

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, resolvedItemId))
    .limit(1);

  if (!item) return { success: false, error: "Content item not found." };

  const access = await requireProjectAccess(actorUserId, item.projectId);
  if (!access.allowed || access.role === "client" || access.role === "designer" || access.role === "video_editor") {
    return { success: false, error: "Unauthorized: Designers cannot mark content as published." };
  }

  const pubTimestamp = publishedAt ? new Date(publishedAt) : new Date();

  const [updated] = await db
    .update(contentItems)
    .set({
      stage: "published",
      liveUrl,
      publishedAt: pubTimestamp,
      publishedByUserId: actorUserId,
      updatedAt: sql`NOW()`,
    })
    .where(eq(contentItems.id, item.id))
    .returning();

  return { success: true, item: updated };
}
