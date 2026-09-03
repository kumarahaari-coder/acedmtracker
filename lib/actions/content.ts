"use server";

import { db, runTransaction } from "../db";
import {
  contentGroups,
  contentItems,
  submissionVersions,
  contentAssignments,
  assignmentDeadlineHistory,
  auditRecords,
  projects,
  projectMemberships,
  users,
  ContentPlatform,
  ContentType,
  ScopeClassification,
} from "../db/schema";
import { effortStandards } from "../db/schema/operational";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveProjectId, resolveContentItemId, resolveUserId } from "../compat/resolver";
import { calculateInternalDeadline, resolveDeliverableLeadTimeWorkdays } from "../calculations/operationalEngine";
import { ContentStage } from "../types";
import { invalidateWorkspaceEntities } from "./revalidation";
import { getCachedEffortStandards } from "../cache/effortStandardsCache";

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
 * 1. Create Standalone Content Item + V1 Draft + Assignment (Atomic Transaction)
 */
export async function createContentItemAction(params: {
  actorUserId: string;
  projectId: string;
  title: string;
  platform?: ContentPlatform;
  contentType?: ContentType;
  workType?: string;
  workTypeId?: string;
  campaignId?: string;
  contentPillar?: string;
  topic?: string;
  brief?: string;
  referenceLink?: string;
  priority?: "urgent" | "normal" | "low";
  workNature?: "planned" | "ad_hoc";
  accountOwnerId?: string;
  productionOwnerId?: string;
  contentEffortAdjustmentHours?: number;
  productionEffortAdjustmentHours?: number;
  finalInternalDeadlineOverride?: string;
  deadlineOverrideReason?: string;
  scopeClassification?: ScopeClassification;
  scheduledPublicationDate?: string;
  submissionDeadline?: string;
  accountableOwnerId?: string;
  initialCopy?: { caption: string; hashtags: string[]; cta: string; destinationUrl?: string };
}) {
  const {
    actorUserId,
    projectId,
    title,
    platform = "Instagram",
    contentType = "reel",
    workType,
    workTypeId,
    campaignId,
    contentPillar,
    topic,
    brief,
    referenceLink,
    priority = "normal",
    workNature = "planned",
    accountOwnerId,
    productionOwnerId,
    contentEffortAdjustmentHours,
    productionEffortAdjustmentHours,
    finalInternalDeadlineOverride,
    deadlineOverrideReason,
    scopeClassification,
    scheduledPublicationDate,
    submissionDeadline,
    accountableOwnerId,
    initialCopy,
  } = params;

  const resolvedProjId = await resolveProjectId(projectId);
  if (!resolvedProjId) return { success: false, error: "Project not found." };

  const access = await requireProjectAccess(actorUserId, resolvedProjId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot create content." };
  }

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Actor not found." };

  const effectiveAssigneeId = productionOwnerId || accountableOwnerId;
  let resolvedAssigneeId: string | undefined = undefined;
  if (effectiveAssigneeId) {
    resolvedAssigneeId = (await resolveUserId(effectiveAssigneeId)) || undefined;
  }

  // Server-Side Project Membership & Role Enforcement for Assignee
  if (resolvedAssigneeId) {
    const [membership] = await db
      .select()
      .from(projectMemberships)
      .where(
        and(
          eq(projectMemberships.projectId, resolvedProjId),
          eq(projectMemberships.userId, resolvedAssigneeId),
          eq(projectMemberships.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      return { success: false, error: "Assignee is not an active member of this project." };
    }

    const eligibleRoles = ["designer", "video_editor", "collaborator", "consultant"];
    if (!eligibleRoles.includes(membership.membershipRole)) {
      return { success: false, error: `Assignee role (${membership.membershipRole}) is not eligible for production ownership.` };
    }

    const [userRow] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, resolvedAssigneeId),
          eq(users.orgId, actor.orgId),
          eq(users.status, "active")
        )
      )
      .limit(1);

    if (!userRow || userRow.organizationRole === "client") {
      return { success: false, error: "Assignee is not an active internal user." };
    }
  }

  // Standard Effort Resolution from Master Standards (Cached)
  let matchedWorkType = workType;
  if (!matchedWorkType) {
    if (contentType === "post") matchedWorkType = "Simple Static Poster";
    else if (contentType === "carousel") matchedWorkType = "Simple Carousel";
    else if (contentType === "reel") matchedWorkType = "Short-form Reel";
    else if (contentType === "trial_reel") matchedWorkType = "Trial Reel Concept";
    else matchedWorkType = "Simple Static Poster";
  }

  const allStandards = await getCachedEffortStandards(actor.orgId);
  let standard = workTypeId ? allStandards.find((s) => s.id === workTypeId) || null : null;

  if (!standard && matchedWorkType) {
    standard =
      allStandards.find((s) => s.workType.toLowerCase() === matchedWorkType.toLowerCase()) || null;
  }

  if (!standard) {
    return { success: false, error: `No active Effort Standard found for work type '${matchedWorkType}'. Data integrity requires a valid standard.` };
  }

  const standardContentSeconds = standard.contentSeconds;
  const standardProductionSeconds = standard.productionSeconds;
  const leadTimeWorkdays = standard.leadTimeWorkdays;
  const contentAdjSeconds = Math.round((contentEffortAdjustmentHours || 0) * 3600);
  const prodAdjSeconds = Math.round((productionEffortAdjustmentHours || 0) * 3600);
  const finalPlannedSeconds = standardContentSeconds + standardProductionSeconds + contentAdjSeconds + prodAdjSeconds;

  const legacyItemId = generateLegacyId("item");
  const legacyVerId = generateLegacyId("ver");
  const legacyAsgnId = generateLegacyId("asgn");

  const copy = initialCopy || { caption: `Draft copy for ${title}`, hashtags: [], cta: "" };
  const fingerprints = computeFingerprints(copy, scheduledPublicationDate);

  const schedDate = scheduledPublicationDate ? new Date(scheduledPublicationDate) : null;
  const calculatedDeadline = schedDate ? calculateInternalDeadline(schedDate, leadTimeWorkdays) : null;
  const finalDeadline = finalInternalDeadlineOverride
    ? new Date(finalInternalDeadlineOverride)
    : (calculatedDeadline || (submissionDeadline ? new Date(submissionDeadline) : (schedDate || new Date())));
  const subDeadline = submissionDeadline ? new Date(submissionDeadline) : finalDeadline;

  try {
    const result = await runTransaction(async (tx) => {
      // 1. Insert ContentItem with full operational & effort snapshot
      const [item] = await tx
        .insert(contentItems)
        .values({
          legacyId: legacyItemId,
          projectId: resolvedProjId,
          orgId: actor.orgId,
          title,
          platform,
          contentType,
          workType: standard.workType,
          workTypeId: standard.id,
          campaignId: campaignId || null,
          contentPillar: contentPillar || null,
          topic: topic || title,
          brief: brief || null,
          referenceLink: referenceLink || null,
          priority: priority || "normal",
          workNature: workNature || "planned",
          accountOwnerId: accountOwnerId || null,
          stage: "draft",
          scopeClassification: scopeClassification || "contracted",
          clientVisible: false,
          scheduledPublicationDate: schedDate,
          submissionDeadline: subDeadline,
          calculatedInternalDeadline: calculatedDeadline,
          finalInternalDeadline: finalDeadline,
          deadlineOverrideReason: finalInternalDeadlineOverride ? (deadlineOverrideReason || "Manual deadline override") : null,
          standardContentSeconds,
          standardProductionSeconds,
          finalPlannedSeconds,
          isEffortAnchor: true,
          currentVersionNumber: 1,
        })
        .returning();

      // 2. Insert V1 Draft
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
          scheduledDate: schedDate,
          copyFingerprint: fingerprints.copyFingerprint,
          creativeFingerprint: fingerprints.creativeFingerprint,
          postingDateFingerprint: fingerprints.postingDateFingerprint,
          createdByUserId: actor.id,
        })
        .returning();

      // 3. Insert ContentAssignment if assignee specified (authoritative task ownership)
      let assignment = null;
      if (resolvedAssigneeId) {
        const [asgn] = await tx
          .insert(contentAssignments)
          .values({
            legacyId: legacyAsgnId,
            projectId: resolvedProjId,
            orgId: actor.orgId,
            contentItemId: item.id,
            assigneeUserId: resolvedAssigneeId,
            assignmentRole: "designer",
            status: "assigned",
            assignedByUserId: actor.id,
            initialDueAt: finalDeadline,
            currentDueAt: finalDeadline,
          })
          .returning();
        assignment = asgn;
      }

      // 4. Audit Log
      await tx
        .insert(auditRecords)
        .values({
          projectId: resolvedProjId,
          orgId: actor.orgId,
          actorUserId: actor.id,
          actorName: actor.fullName,
          actorRole: actor.organizationRole,
          action: "create_content_item",
          entityType: "content_item",
          entityId: item.id,
          summary: `Created content item '${title}' (${platform} • ${contentType} • ${standard.workType}) with planned effort ${(finalPlannedSeconds / 3600).toFixed(2)}h`,
          reason: "Created in workspace",
        });

      return { item, version, assignment };
    });

    // Invalidate caches across the project
    await invalidateWorkspaceEntities({
      projectId: resolvedProjId,
      userId: resolvedAssigneeId || actorUserId,
      orgId: actor.orgId,
    });

    return { success: true, ...result };
  } catch (err: any) {
    console.error("Failed to create content item transactionally:", err);
    return { success: false, error: err.message || "Failed to create content item." };
  }
}

/**
 * 2. Create Multi-Platform Content Group + N Content Items + N V1 Drafts (Atomic Transaction)
 * Enforces:
 * - ContentGroup shared creative production effort = Effort Standard (e.g. 3.75h)
 * - Explicit isEffortAnchor = true on primary creative item, false on sibling distributions
 * - Sibling items record adaptation effort (default 0s)
 * - Assignee must be active member of project with eligible operational role
 */
export async function createContentGroupAction(params: {
  actorUserId: string;
  projectId: string;
  title: string;
  description?: string;
  conceptNotes?: string;
  workType?: string;
  workTypeId?: string;
  scopeClassification?: ScopeClassification;
  workNature?: "planned" | "ad_hoc";
  platforms: Array<{
    platform: ContentPlatform;
    contentType: ContentType;
    scheduledPublicationDate?: string;
    submissionDeadline?: string;
    accountableOwnerId?: string;
    scopeClassification?: ScopeClassification;
    adaptationSeconds?: number;
  }>;
  sharedInitialCopy?: { caption: string; hashtags: string[]; cta: string; destinationUrl?: string };
}) {
  const { actorUserId, projectId, title, description, conceptNotes, workType, workTypeId, scopeClassification, workNature, platforms, sharedInitialCopy } = params;

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

  // Resolve Master Effort Standard for the Content Group (Cached)
  let matchedWorkType = workType;
  if (!matchedWorkType) {
    const firstType = platforms[0].contentType;
    if (firstType === "post") matchedWorkType = "Simple Static Poster";
    else if (firstType === "carousel") matchedWorkType = "Simple Carousel";
    else if (firstType === "reel") matchedWorkType = "Short-form Reel";
    else if (firstType === "trial_reel") matchedWorkType = "Trial Reel Concept";
    else matchedWorkType = "Simple Static Poster";
  }

  const allGroupStandards = await getCachedEffortStandards(actor.orgId);
  let standard = workTypeId ? allGroupStandards.find((s) => s.id === workTypeId) || null : null;

  if (!standard && matchedWorkType) {
    standard =
      allGroupStandards.find((s) => s.workType.toLowerCase() === matchedWorkType.toLowerCase()) || null;
  }

  if (!standard) {
    return { success: false, error: `No active Effort Standard found for work type '${matchedWorkType}'. Data integrity requires a valid standard.` };
  }

  // Pre-validate all assignees against project membership
  const resolvedAssigneeMap: Record<number, string> = {};
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.accountableOwnerId) {
      const resolvedAssigneeId = await resolveUserId(p.accountableOwnerId);
      if (!resolvedAssigneeId) {
        return { success: false, error: `Assignee not found for platform ${p.platform}.` };
      }

      const [membership] = await db
        .select()
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.projectId, resolvedProjId),
            eq(projectMemberships.userId, resolvedAssigneeId),
            eq(projectMemberships.status, "active")
          )
        )
        .limit(1);

      if (!membership) {
        return { success: false, error: `Assignee for ${p.platform} is not an active member of this project.` };
      }

      const eligibleRoles = ["designer", "video_editor", "collaborator", "consultant"];
      if (!eligibleRoles.includes(membership.membershipRole)) {
        return { success: false, error: `Assignee role (${membership.membershipRole}) on ${p.platform} is not eligible for production ownership.` };
      }

      resolvedAssigneeMap[i] = resolvedAssigneeId;
    }
  }

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
      const createdAssignments = [];

      // 2. Insert child items with explicit effort anchor semantics
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        const isAnchor = i === 0;
        const legacyItemId = generateLegacyId("item");
        const legacyVerId = generateLegacyId("ver");
        const legacyAsgnId = generateLegacyId("asgn");
        const fingerprints = computeFingerprints(copy, p.scheduledPublicationDate);

        const schedDate = p.scheduledPublicationDate ? new Date(p.scheduledPublicationDate) : null;
        const calculatedDeadline = schedDate ? calculateInternalDeadline(schedDate, standard.leadTimeWorkdays) : null;
        const subDeadline = p.submissionDeadline ? new Date(p.submissionDeadline) : (calculatedDeadline || schedDate || new Date());

        // Primary Anchor item snapshots full shared creative standard effort. Sibling platforms snapshot adaptation effort (default 0).
        const itemPlannedSeconds = isAnchor
          ? standard.totalSeconds + (p.adaptationSeconds || 0)
          : (p.adaptationSeconds || 0);

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
            workType: standard.workType,
            workTypeId: standard.id,
            topic: title,
            stage: "draft",
            scopeClassification: p.scopeClassification || scopeClassification || "contracted",
            workNature: workNature || "planned",
            clientVisible: false,
            scheduledPublicationDate: schedDate,
            submissionDeadline: subDeadline,
            calculatedInternalDeadline: calculatedDeadline,
            finalInternalDeadline: calculatedDeadline || subDeadline,
            standardContentSeconds: isAnchor ? standard.contentSeconds : 0,
            standardProductionSeconds: isAnchor ? standard.productionSeconds : 0,
            finalPlannedSeconds: itemPlannedSeconds,
            isEffortAnchor: isAnchor,
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
            scheduledDate: schedDate,
            copyFingerprint: fingerprints.copyFingerprint,
            creativeFingerprint: fingerprints.creativeFingerprint,
            postingDateFingerprint: fingerprints.postingDateFingerprint,
            createdByUserId: actor.id,
          })
          .returning();

        createdItems.push(item);
        createdVersions.push(version);

        if (p.accountableOwnerId) {
          const resolvedAssigneeId = resolvedAssigneeMap[i];
          if (resolvedAssigneeId) {
            const [asgn] = await tx
              .insert(contentAssignments)
              .values({
                legacyId: legacyAsgnId,
                projectId: resolvedProjId,
                orgId: actor.orgId,
                contentItemId: item.id,
                assigneeUserId: resolvedAssigneeId,
                assignmentRole: "designer",
                status: "assigned",
                assignedByUserId: actor.id,
                initialDueAt: subDeadline,
                currentDueAt: subDeadline,
              })
              .returning();
            createdAssignments.push(asgn);
          }
        }
      }

      // Audit Log
      await tx
        .insert(auditRecords)
        .values({
          projectId: resolvedProjId,
          orgId: actor.orgId,
          actorUserId: actor.id,
          actorName: actor.fullName,
          actorRole: actor.organizationRole,
          action: "create_content_group",
          entityType: "content_group",
          entityId: group.id,
          summary: `Created multi-platform content group '${title}' across ${platforms.map((p) => p.platform).join(", ")}`,
          reason: "Created in workspace",
        });

      return { group, items: createdItems, versions: createdVersions, assignments: createdAssignments };
    });

    // Invalidate caches across the project
    await invalidateWorkspaceEntities({
      projectId: resolvedProjId,
      userId: actorUserId,
      orgId: actor.orgId,
    });

    return { success: true, ...result };
  } catch (err: any) {
    console.error("Failed to create content group transactionally:", err);
    return { success: false, error: err.message || "Failed to create content group transactionally." };
  }
}

/**
 * 3. Save Draft Submission Version (Designer/Internal action)
 */
/**
 * Resolves active draft version for a content item directly from PostgreSQL
 */
export async function getAuthoritativeActiveDraftAction(params: {
  actorUserId: string;
  contentItemId: string;
}) {
  const { actorUserId, contentItemId } = params;
  const resolvedItemId = await resolveContentItemId(contentItemId);
  if (!resolvedItemId) return { success: false, error: "Content item not found." };

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, resolvedItemId))
    .limit(1);

  if (!item) return { success: false, error: "Content item not found." };

  const access = await requireProjectAccess(actorUserId, item.projectId);
  if (!access.allowed) return { success: false, error: "Unauthorized access to content item." };

  // Find active draft version
  let [draft] = await db
    .select()
    .from(submissionVersions)
    .where(and(eq(submissionVersions.contentItemId, item.id), eq(submissionVersions.isDraft, true)))
    .limit(1);

  if (draft) {
    return { success: true, item, draft };
  }

  // No active draft exists. Check if item lifecycle allows auto-creating an initial draft or revision draft.
  const [existingVersionsCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(submissionVersions)
    .where(eq(submissionVersions.contentItemId, item.id));

  const count = Number(existingVersionsCount?.count || 0);

  if (item.stage === "draft" && count === 0) {
    // Initial creation: Item is in initial editable draft stage and has NO existing versions
    const createRes = await createNewVersionDraftAction({ actorUserId, contentItemId: item.id });
    if (createRes.success && (createRes as any).version) {
      return { success: true, item, draft: (createRes as any).version };
    }
    return { success: false, code: "DRAFT_CREATION_FAILED", error: createRes.error || "Failed to create initial draft." };
  }

  if (item.stage === "changes_requested") {
    // Explicit revision state: auto-create revision draft if not already present
    const createRes = await createNewVersionDraftAction({ actorUserId, contentItemId: item.id });
    if (createRes.success && (createRes as any).version) {
      return { success: true, item, draft: (createRes as any).version };
    }
    return { success: false, code: "REVISION_DRAFT_CREATION_FAILED", error: createRes.error || "Failed to create revision draft." };
  }

  // Classified lifecycle error returns when content is locked or in review
  if (item.stage === "submitted" || item.stage === "in_review") {
    return {
      success: false,
      code: "LIFECYCLE_SUBMITTED_LOCKED",
      error: "Version has been submitted for review and cannot be edited until feedback or changes are requested.",
    };
  }

  if (item.stage === "approved") {
    return {
      success: false,
      code: "LIFECYCLE_APPROVED_LOCKED",
      error: "Content item is approved and locked. Create a revision request to make changes.",
    };
  }

  if (item.stage === "scheduled" || item.stage === "published") {
    return {
      success: false,
      code: "LIFECYCLE_PUBLISHED_LOCKED",
      error: "Content item is scheduled or published and cannot be edited directly.",
    };
  }

  return {
    success: false,
    code: "LIFECYCLE_NO_ACTIVE_DRAFT",
    error: `No active draft exists for content item in stage '${item.stage}'.`,
  };
}

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

  await invalidateWorkspaceEntities({
    projectId: version.projectId,
    userId: actorUserId,
    orgId: version.orgId,
  });

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

  await invalidateWorkspaceEntities({
    projectId: version.projectId,
    userId: actorUserId,
    orgId: version.orgId,
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

  const result = await runTransaction(async (tx) => {
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

    const maxVer = Number(maxVersionResult[0]?.maxVer || 0);
    const nextVerNum = maxVer > 0 ? maxVer + 1 : 1;

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

    return { success: true, version: newVersion, item };
  });

  if (result.success && (result as any).item) {
    await invalidateWorkspaceEntities({
      projectId: (result as any).item.projectId,
      userId: actorUserId,
      orgId: (result as any).item.orgId,
    });
  }

  return result;
}

/**
 * Canonical Reschedule Deliverable Action
 * Updates target publication date and recalculates operational internal deadline
 * using lead-time workdays (skipping weekends) unless manually overridden.
 * Updates content_items and active content_assignments atomically in PostgreSQL.
 */
export async function rescheduleContentItemAction(params: {
  actorUserId?: string;
  contentItemId: string;
  scheduledPublicationDate: string;
  reason?: string;
  forceRecalculateInternalDeadline?: boolean;
}): Promise<{ success: boolean; item?: any; assignment?: any; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser(params.actorUserId);
    if (!authUser) return { success: false, error: "Unauthorized" };

    const resolvedItemId = await resolveContentItemId(params.contentItemId);
    if (!resolvedItemId) return { success: false, error: "Content item not found" };

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, resolvedItemId))
      .limit(1);

    if (!item) return { success: false, error: "Content item not found" };

    const access = await requireProjectAccess(authUser.id, item.projectId);
    if (!access.allowed || access.role === "client" || access.role === "designer" || access.role === "video_editor") {
      return { success: false, error: "Unauthorized: Designers and clients cannot reschedule publication dates." };
    }

    const newPubDate = new Date(params.scheduledPublicationDate);

    // Fetch active effort standards for org to resolve lead time
    const orgStandards = await db
      .select()
      .from(effortStandards)
      .where(and(eq(effortStandards.orgId, item.orgId), eq(effortStandards.active, true)));

    const { leadTimeWorkdays } = resolveDeliverableLeadTimeWorkdays(item as any, orgStandards as any);

    // Check if internal deadline has been manually overridden
    const isManuallyOverridden = !!(item as any).deadlineOverrideReason && !params.forceRecalculateInternalDeadline;

    let newInternalDeadline = (item as any).finalInternalDeadline || item.submissionDeadline || newPubDate;
    if (!isManuallyOverridden) {
      newInternalDeadline = calculateInternalDeadline(newPubDate, leadTimeWorkdays);
    }

    // Execute atomic update in PostgreSQL
    const itemUpdates: Record<string, any> = {
      scheduledPublicationDate: newPubDate,
      updatedAt: sql`NOW()`,
    };

    if (!isManuallyOverridden) {
      itemUpdates.submissionDeadline = newInternalDeadline;
    }

    const [updatedItem] = await db
      .update(contentItems)
      .set(itemUpdates)
      .where(eq(contentItems.id, item.id))
      .returning();

    // Update active assignment current_due_at to match new internal deadline
    const [activeAssignment] = await db
      .select()
      .from(contentAssignments)
      .where(and(eq(contentAssignments.contentItemId, item.id), sql`status != 'reassigned'`))
      .limit(1);

    let updatedAssignment = null;
    if (activeAssignment && !isManuallyOverridden) {
      const [asgn] = await db
        .update(contentAssignments)
        .set({
          currentDueAt: newInternalDeadline,
          updatedAt: sql`NOW()`,
        })
        .where(eq(contentAssignments.id, activeAssignment.id))
        .returning();
      updatedAssignment = asgn;
    }

    await invalidateWorkspaceEntities({
      projectId: item.projectId,
      userId: authUser.id,
      orgId: item.orgId,
    });

    return { success: true, item: updatedItem, assignment: updatedAssignment };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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

  const schedDate = scheduledPublicationDate ? new Date(scheduledPublicationDate) : null;
  const subDeadline = submissionDeadline !== undefined ? (submissionDeadline ? new Date(submissionDeadline) : null) : item.submissionDeadline;

  const [updated] = await db
    .update(contentItems)
    .set({
      scheduledPublicationDate: schedDate,
      submissionDeadline: subDeadline,
      updatedAt: sql`NOW()`,
    })
    .where(eq(contentItems.id, item.id))
    .returning();

  await invalidateWorkspaceEntities({
    projectId: item.projectId,
    userId: actorUserId,
    orgId: item.orgId,
  });

  return { success: true, item: updated };
}

/**
 * 7. Update Deadline / Reschedule Action (Supports multiple deadline layers)
 */
export async function updateDeadlineAction(params: {
  actorUserId: string;
  contentItemId: string;
  kind: "scheduled_publication" | "submission" | "resubmission" | "approval_target" | "actual_publication";
  newDueAt: string;
  reason?: string;
}) {
  const { actorUserId, contentItemId, kind, newDueAt, reason } = params;

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
    return { success: false, error: "Unauthorized: Only management can modify milestone deadlines." };
  }

  const targetDate = new Date(newDueAt);
  const updates: Record<string, any> = { updatedAt: sql`NOW()` };

  if (kind === "scheduled_publication") {
    updates.scheduledPublicationDate = targetDate;
  } else if (kind === "submission") {
    updates.submissionDeadline = targetDate;
  } else if (kind === "resubmission") {
    updates.resubmissionDeadline = targetDate;
  } else if (kind === "approval_target") {
    updates.approvalTarget = targetDate;
  } else if (kind === "actual_publication") {
    updates.publishedAt = targetDate;
    updates.stage = "published";
  }

  const [updatedItem] = await db
    .update(contentItems)
    .set(updates)
    .where(eq(contentItems.id, item.id))
    .returning();

  await invalidateWorkspaceEntities({
    projectId: item.projectId,
    userId: actorUserId,
    orgId: item.orgId,
  });

  return { success: true, item: updatedItem };
}

/**
 * 8. Update Publication Details Action (Actual live date + live URL)
 */
export async function updatePublicationDetailsAction(params: {
  actorUserId: string;
  contentItemId: string;
  publishedAt: string;
  liveUrl?: string;
  reason?: string;
}) {
  const { actorUserId, contentItemId, publishedAt, liveUrl, reason } = params;

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
    return { success: false, error: "Unauthorized: Only management can update actual publication details." };
  }

  const pubDate = new Date(publishedAt);
  const updates: Record<string, any> = {
    publishedAt: pubDate,
    stage: "published",
    updatedAt: sql`NOW()`,
  };
  if (liveUrl) updates.liveUrl = liveUrl;

  const [updated] = await db
    .update(contentItems)
    .set(updates)
    .where(eq(contentItems.id, item.id))
    .returning();

  await invalidateWorkspaceEntities({
    projectId: item.projectId,
    userId: actorUserId,
    orgId: item.orgId,
  });

  return { success: true, item: updated };
}

/**
 * 9. Set Client Visibility (Restricted: Founder, Admin, Consultant)
 */
export async function setClientVisibilityAction(params: {
  actorUserId?: string;
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

  const authUser = await getAuthoritativeUser(actorUserId);
  if (!authUser) return { success: false, error: "Unauthorized." };

  const access = await requireProjectAccess(authUser.id, item.projectId);
  if (!access.allowed || access.role === "client" || access.role === "designer" || access.role === "video_editor") {
    return { success: false, error: "Unauthorized: Management authorization required to modify client visibility." };
  }

  const [updated] = await db
    .update(contentItems)
    .set({
      clientVisible,
      updatedAt: sql`NOW()`,
    })
    .where(eq(contentItems.id, item.id))
    .returning();

  await invalidateWorkspaceEntities({
    projectId: item.projectId,
    userId: authUser.id,
    orgId: item.orgId,
  });

  return { success: true, item: updated };
}

export { setClientVisibilityAction as toggleClientVisibilityAction };

/**
 * Update Content Item Workflow Stage (Kanban Drag & Drop / Stage Select)
 * Explicitly updates content_items.stage in PostgreSQL.
 * Validates legal stage transitions (or permits Founder/Admin override).
 */
export async function updateContentItemStageAction(params: {
  actorUserId?: string;
  contentItemId: string;
  stage: ContentStage;
  reason?: string;
}): Promise<{ success: boolean; item?: any; error?: string }> {
  try {
    const authUser = await getAuthoritativeUser(params.actorUserId);
    if (!authUser) return { success: false, error: "Unauthorized" };

    const resolvedItemId = await resolveContentItemId(params.contentItemId);
    if (!resolvedItemId) return { success: false, error: "Content item not found" };

    const [item] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, resolvedItemId))
      .limit(1);

    if (!item) return { success: false, error: "Content item not found" };

    const isDesigner = authUser.organizationRole === "designer";
    const isFounderOrAdmin = authUser.organizationRole === "founder" || authUser.organizationRole === "admin";
    const currentStage = item.stage;
    const targetStage = params.stage;

    if (isDesigner) {
      // Designers can ONLY modify stage on deliverables assigned to them
      const [activeAssignment] = await db
        .select()
        .from(contentAssignments)
        .where(
          and(
            eq(contentAssignments.contentItemId, item.id),
            eq(contentAssignments.assigneeUserId, authUser.id),
            inArray(contentAssignments.status, ["assigned", "accepted", "in_progress"])
          )
        )
        .limit(1);

      if (!activeAssignment && (item as any).accountableOwnerId !== authUser.id) {
        return {
          success: false,
          error: "Unauthorized: Designers can only update stage on deliverables assigned to themselves.",
        };
      }

      if (targetStage === "submitted") {
        if (currentStage !== "draft" && currentStage !== "changes_requested") {
          return {
            success: false,
            error: `Unauthorized: Cannot submit for review when item stage is '${currentStage}'. Must be 'draft' or 'changes_requested'.`,
          };
        }
      }
    }

    const allowedTransitions: Record<string, string[]> = {
      idea: ["draft", "submitted"],
      draft: ["submitted", "in_review"],
      submitted: ["in_review", "changes_requested", "approved", "draft"],
      in_review: ["changes_requested", "approved", "submitted"],
      changes_requested: ["submitted", "in_review", "draft"],
      approved: ["scheduled", "published", "in_review"],
      scheduled: ["published", "approved"],
      published: ["reported", "insights_pending"],
    };

    if (!isFounderOrAdmin && currentStage !== targetStage) {
      const legalNext = allowedTransitions[currentStage] || [];
      if (!legalNext.includes(targetStage)) {
        return {
          success: false,
          error: `Illegal workflow transition from '${currentStage}' to '${targetStage}'.`,
        };
      }
    }

    const updates: Record<string, any> = {
      stage: targetStage,
      updatedAt: sql`NOW()`,
    };

    if (targetStage === "published" && !item.publishedAt) {
      updates.publishedAt = sql`NOW()`;
    }

    const [updated] = await db
      .update(contentItems)
      .set(updates)
      .where(eq(contentItems.id, item.id))
      .returning();

    await invalidateWorkspaceEntities({
      projectId: item.projectId,
      userId: authUser.id,
      orgId: item.orgId,
    });

    return { success: true, item: updated };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 10. Mark Content Published (Restricted: Founder, Admin, Consultant with strict https:// URL validation)
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

  await invalidateWorkspaceEntities({
    projectId: item.projectId,
    userId: actorUserId,
    orgId: item.orgId,
    tags: ["performance", "content", "calendar", "workspace"],
  });

  return { success: true, item: updated };
}

/**
 * 11. Generic Operational Task Completion (Meetings, Research, Reports, Blogs, Landing Pages, etc.)
 */
export async function completeTaskAction(params: {
  actorUserId: string;
  contentItemId: string;
  completedAt?: string;
}) {
  const { actorUserId, contentItemId, completedAt } = params;

  const resolvedItemId = await resolveContentItemId(contentItemId);
  if (!resolvedItemId) return { success: false, error: "Task not found." };

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, resolvedItemId))
    .limit(1);

  if (!item) return { success: false, error: "Task not found." };

  const access = await requireProjectAccess(actorUserId, item.projectId);
  if (!access.allowed || access.role === "client") {
    return { success: false, error: "Unauthorized: Clients cannot mark tasks completed." };
  }

  const compTimestamp = completedAt ? new Date(completedAt) : new Date();

  const [updated] = await db
    .update(contentItems)
    .set({
      stage: item.stage === "draft" || item.stage === "in_review" ? "approved" : item.stage,
      updatedAt: sql`NOW()`,
    })
    .where(eq(contentItems.id, item.id))
    .returning();

  // Also complete open assignment if present
  await db
    .update(contentAssignments)
    .set({
      status: "completed",
      completedAt: compTimestamp,
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(contentAssignments.contentItemId, item.id), sql`${contentAssignments.status} != 'completed'`));

  await invalidateWorkspaceEntities({
    projectId: item.projectId,
    userId: actorUserId,
    orgId: item.orgId,
    tags: ["performance", "content", "calendar", "workspace"],
  });

  return { success: true, item: updated };
}

