"use server";

import { db } from "../db";
import {
  contentItems,
  projects,
  contentGroups,
  contentAssignments,
  submissionVersions,
  submissionAssets,
  workSessions,
  changeRequests,
  approvalDecisions,
  founderOverrides,
  comments,
  scripts,
  projectMemberships,
  users,
  creativeAssets,
} from "../db/schema";
import { eq, and, sql, desc, asc, isNull, inArray } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { resolveProjectId, resolveContentItemId } from "../compat/resolver";
import { ExecutionProfiler } from "../observability/profiler";
import {
  ContentItem,
  SubmissionVersion,
  ContentAssignment,
  WorkSession,
  ChangeRequest,
  ApprovalDecision,
  FounderOverride,
  Comment,
  ContentStage,
  ContentPlatform,
  ContentType,
  ScopeClassification,
} from "../types";

export interface ContentItemDetailDTO {
  project: {
    id: string;
    name: string;
    clientBrand: string;
    status: string;
    engagementModel?: string;
  };
  item: ContentItem;
  contentGroup?: {
    id: string;
    title: string;
    description?: string;
    conceptNotes?: string;
  };
  siblingGroupItems: Array<{
    id: string;
    title: string;
    platform: ContentPlatform;
    contentType: ContentType;
    stage: ContentStage;
    isEffortAnchor: boolean;
  }>;
  activeAssignment?: ContentAssignment;
  itemWorkSessions: WorkSession[];
  itemVersions: SubmissionVersion[];
  approvalDecisions: ApprovalDecision[];
  founderOverrides: FounderOverride[];
  changeRequests: ChangeRequest[];
  comments: Comment[];
  linkedScript?: {
    id: string;
    title: string;
    status: string;
    hook?: string;
  };
  projectMembers: Array<{
    userId: string;
    name: string;
    role: string;
    avatar?: string;
  }>;
}

/**
 * Authoritative, single-item bounded detail query.
 * Cross-project safeguarded: requires content_items.id = itemId AND content_items.project_id = projectId.
 * Never performs global workspace hydration.
 */
export async function getAuthoritativeContentItemDetailAction(
  projectId: string,
  itemId: string,
  actorUserId?: string
): Promise<{
  success: boolean;
  data?: ContentItemDetailDTO;
  error?: string;
  notFound?: boolean;
  forbidden?: boolean;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeContentItemDetailAction");

  try {
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) {
      return { success: false, error: "Unauthorized" };
    }
    profiler.mark("auth-resolution");

    if (!projectId || !itemId) {
      return { success: false, error: "Missing projectId or itemId", notFound: true };
    }

    const resolvedProjId = (await resolveProjectId(projectId)) || projectId;
    const resolvedItemId = (await resolveContentItemId(itemId)) || itemId;

    const isClient = authUser.organizationRole === "client";
    const orgId = authUser.orgId;

    // 1. Fetch Project & verify access
    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientBrand: projects.clientName,
        status: projects.status,
        engagementModel: projects.engagementModel,
      })
      .from(projects)
      .where(and(eq(projects.id, resolvedProjId), eq(projects.orgId, orgId)))
      .limit(1);

    if (!project) {
      return { success: false, error: "Project not found or inaccessible", notFound: true };
    }

    if (isClient) {
      const [membership] = await db
        .select({ id: projectMemberships.id })
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.projectId, resolvedProjId),
            eq(projectMemberships.userId, authUser.id),
            eq(projectMemberships.status, "active")
          )
        )
        .limit(1);

      if (!membership) {
        return { success: false, error: "Access denied to this project", forbidden: true };
      }
    }

    // 2. Fetch single Content Item with Cross-Project Safeguard
    const [dbItem] = await db
      .select()
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, resolvedItemId),
          eq(contentItems.projectId, resolvedProjId),
          isNull(contentItems.deletedAt)
        )
      )
      .limit(1);

    if (!dbItem) {
      // Check if item exists in another project for clean diagnostic error
      const [itemInOtherProject] = await db
        .select({ id: contentItems.id, projectId: contentItems.projectId })
        .from(contentItems)
        .where(and(eq(contentItems.id, resolvedItemId), isNull(contentItems.deletedAt)))
        .limit(1);

      if (itemInOtherProject) {
        return {
          success: false,
          error: `Cross-project mismatch: Content deliverable belongs to project '${itemInOtherProject.projectId}', not '${resolvedProjId}'.`,
          notFound: true,
        };
      }

      return { success: false, error: "Content deliverable not found", notFound: true };
    }

    // Client Visibility Check
    if (isClient && !dbItem.clientVisible) {
      return {
        success: false,
        error: "This content deliverable is internal and not visible to clients.",
        forbidden: true,
      };
    }

    // 3. Parallel bounded queries strictly for this single item
    const [
      versionRows,
      assignmentRows,
      workSessionRows,
      changeRequestRows,
      decisionRows,
      overrideRows,
      commentRows,
      projectMemberRows,
      scriptRows,
      groupRows,
      siblingRows,
      assetRows,
    ] = await Promise.all([
      // A. Submission Versions for this item
      db
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.contentItemId, dbItem.id))
        .orderBy(asc(submissionVersions.versionNumber)),

      // B. Assignments for this item
      db
        .select({
          id: contentAssignments.id,
          legacyId: contentAssignments.legacyId,
          projectId: contentAssignments.projectId,
          orgId: contentAssignments.orgId,
          contentItemId: contentAssignments.contentItemId,
          assigneeUserId: contentAssignments.assigneeUserId,
          assignmentRole: contentAssignments.assignmentRole,
          status: contentAssignments.status,
          initialDueAt: contentAssignments.initialDueAt,
          currentDueAt: contentAssignments.currentDueAt,
          acceptedAt: contentAssignments.acceptedAt,
          startedAt: contentAssignments.startedAt,
          completedAt: contentAssignments.completedAt,
          reassignmentReason: contentAssignments.reassignmentReason,
          assignedByUserId: contentAssignments.assignedByUserId,
          createdAt: contentAssignments.createdAt,
          updatedAt: contentAssignments.updatedAt,
          assigneeName: users.fullName,
          assigneeEmail: users.email,
          assigneeRole: users.organizationRole,
          assigneeAvatar: users.avatarUrl,
        })
        .from(contentAssignments)
        .leftJoin(users, eq(contentAssignments.assigneeUserId, users.id))
        .where(eq(contentAssignments.contentItemId, dbItem.id)),

      // C. Work Sessions for this item
      db
        .select()
        .from(workSessions)
        .where(eq(workSessions.contentItemId, dbItem.id))
        .orderBy(desc(workSessions.startedAt)),

      // D. Change Requests for this item
      db
        .select()
        .from(changeRequests)
        .where(eq(changeRequests.contentItemId, dbItem.id))
        .orderBy(desc(changeRequests.createdAt)),

      // E. Approval Decisions for this item (active, not revoked)
      db
        .select()
        .from(approvalDecisions)
        .where(and(eq(approvalDecisions.contentItemId, dbItem.id), isNull(approvalDecisions.revokedAt))),

      // F. Founder Overrides for this item
      db
        .select()
        .from(founderOverrides)
        .where(eq(founderOverrides.contentItemId, dbItem.id)),

      // G. Comments for this item
      db
        .select()
        .from(comments)
        .where(eq(comments.contentItemId, dbItem.id))
        .orderBy(asc(comments.createdAt)),

      // H. Project Members for assignee modal
      db
        .select({
          userId: projectMemberships.userId,
          membershipRole: projectMemberships.membershipRole,
          fullName: users.fullName,
          email: users.email,
          avatarUrl: users.avatarUrl,
          organizationRole: users.organizationRole,
        })
        .from(projectMemberships)
        .leftJoin(users, eq(projectMemberships.userId, users.id))
        .where(
          and(
            eq(projectMemberships.projectId, resolvedProjId),
            eq(projectMemberships.status, "active")
          )
        ),

      // I. Linked Script (if any)
      db
        .select({
          id: scripts.id,
          title: scripts.title,
          status: scripts.status,
          hook: scripts.hook,
        })
        .from(scripts)
        .where(eq(scripts.linkedContentItemId, dbItem.id))
        .limit(1),

      // J. Content Group (if belongs to one)
      dbItem.contentGroupId
        ? db
            .select()
            .from(contentGroups)
            .where(eq(contentGroups.id, dbItem.contentGroupId))
            .limit(1)
        : Promise.resolve([]),

      // K. Sibling items in same group (if belongs to one)
      dbItem.contentGroupId
        ? db
            .select({
              id: contentItems.id,
              title: contentItems.title,
              platform: contentItems.platform,
              contentType: contentItems.contentType,
              stage: contentItems.stage,
              isEffortAnchor: contentItems.isEffortAnchor,
            })
            .from(contentItems)
            .where(
              and(
                eq(contentItems.contentGroupId, dbItem.contentGroupId),
                isNull(contentItems.deletedAt)
              )
            )
        : Promise.resolve([]),

      // L. Assets for all versions of this item
      db
        .select({
          id: creativeAssets.id,
          submissionVersionId: submissionAssets.submissionVersionId,
          filename: creativeAssets.originalFilename,
          fileSizeBytes: creativeAssets.fileSizeBytes,
          mimeType: creativeAssets.mimeType,
          previewUrl: creativeAssets.driveUrl,
          contentHash: creativeAssets.contentHash,
          storageKey: creativeAssets.r2ObjectKey,
        })
        .from(submissionAssets)
        .innerJoin(creativeAssets, eq(submissionAssets.creativeAssetId, creativeAssets.id))
        .innerJoin(submissionVersions, eq(submissionAssets.submissionVersionId, submissionVersions.id))
        .where(eq(submissionVersions.contentItemId, dbItem.id)),
    ]);

    profiler.mark("parallel-queries");

    // 4. Map Assets by submissionVersionId
    const assetsByVersion = new Map<string, any[]>();
    for (const asset of assetRows) {
      const vId = asset.submissionVersionId;
      const list = assetsByVersion.get(vId) || [];
      list.push({
        assetId: asset.id,
        filename: asset.filename,
        fileSizeBytes: Number(asset.fileSizeBytes || 0),
        mimeType: asset.mimeType,
        previewUrl: asset.previewUrl || "",
        contentHash: asset.contentHash || "",
        storageKey: asset.storageKey || undefined,
      });
      assetsByVersion.set(vId, list);
    }

    // 5. Shape Submission Versions with their assets
    const mappedVersions: SubmissionVersion[] = versionRows.map((v) => ({
      id: v.id,
      contentItemId: v.contentItemId,
      versionNumber: v.versionNumber,
      isDraft: v.isDraft,
      submittedAt: v.submittedAt ? v.submittedAt.toISOString() : undefined,
      createdAt: v.createdAt.toISOString(),
      copy: {
        caption: v.caption || "",
        hashtags: v.hashtags || [],
        cta: v.cta || "",
        destinationUrl: v.destinationUrl || undefined,
      },
      creativeAssets: assetsByVersion.get(v.id) || [],
      scheduledDate: v.scheduledDate ? v.scheduledDate.toISOString() : undefined,
      componentFingerprints: {
        copyFingerprint: v.copyFingerprint || "",
        creativeFingerprint: v.creativeFingerprint || "",
        postingDateFingerprint: v.postingDateFingerprint || "",
      },
      createdByUserId: v.createdByUserId || undefined,
    }));

    // Find active assignment
    const activeAsgn = assignmentRows.find((a) => a.status !== "reassigned");
    const mappedActiveAssignment: ContentAssignment | undefined = activeAsgn
      ? {
          id: activeAsgn.id,
          projectId: activeAsgn.projectId,
          contentItemId: activeAsgn.contentItemId,
          assigneeUserId: activeAsgn.assigneeUserId,
          assignmentRole: activeAsgn.assignmentRole as any,
          status: activeAsgn.status as any,
          assignedByUserId: activeAsgn.assignedByUserId,
          assignedAt: activeAsgn.createdAt.toISOString(),
          initialDueAt: activeAsgn.initialDueAt.toISOString(),
          currentDueAt: activeAsgn.currentDueAt.toISOString(),
          acceptedAt: activeAsgn.acceptedAt ? activeAsgn.acceptedAt.toISOString() : undefined,
          startedAt: activeAsgn.startedAt ? activeAsgn.startedAt.toISOString() : undefined,
          completedAt: activeAsgn.completedAt ? activeAsgn.completedAt.toISOString() : undefined,
          reassignmentReason: activeAsgn.reassignmentReason || undefined,
          createdAt: activeAsgn.createdAt.toISOString(),
          updatedAt: activeAsgn.updatedAt.toISOString(),
        }
      : undefined;

    // Latest submitted version and active draft version
    const submittedVersions = mappedVersions.filter((v) => !v.isDraft && v.submittedAt);
    const latestSubmittedVersion = submittedVersions[submittedVersions.length - 1];
    const draftVersion = mappedVersions.find((v) => v.isDraft);

    // Map Content Item DTO
    const mappedItem: ContentItem = {
      id: dbItem.id,
      projectId: dbItem.projectId,
      contentGroupId: dbItem.contentGroupId || undefined,
      title: dbItem.title,
      platform: (dbItem.platform || "Instagram") as ContentPlatform,
      contentType: (dbItem.contentType || "post") as ContentType,
      workType: dbItem.workType || undefined,
      workTypeId: dbItem.workTypeId || undefined,
      topic: dbItem.topic || undefined,
      stage: dbItem.stage as ContentStage,
      scopeClassification: (dbItem.scopeClassification || "contracted") as ScopeClassification,
      workNature: (dbItem.workNature || "planned") as "planned" | "ad_hoc",
      currentVersionNumber: dbItem.currentVersionNumber,
      latestSubmittedVersionId: latestSubmittedVersion?.id,
      activeDraftVersionId: draftVersion?.id,
      clientVisible: dbItem.clientVisible || false,
      accountableOwnerId: mappedActiveAssignment?.assigneeUserId || dbItem.accountOwnerId || "",
      collaboratorIds: [],
      standardContentSeconds: dbItem.standardContentSeconds || 0,
      standardProductionSeconds: dbItem.standardProductionSeconds || 0,
      finalPlannedSeconds: dbItem.finalPlannedSeconds || 0,
      isEffortAnchor: dbItem.isEffortAnchor || false,
      deadlines: {
        submissionDeadline: dbItem.submissionDeadline ? dbItem.submissionDeadline.toISOString() : undefined,
        scheduledPublicationDate: dbItem.scheduledPublicationDate ? dbItem.scheduledPublicationDate.toISOString() : undefined,
        resubmissionDeadline: dbItem.resubmissionDeadline ? dbItem.resubmissionDeadline.toISOString() : undefined,
        approvalTarget: dbItem.approvalTarget ? dbItem.approvalTarget.toISOString() : undefined,
      },
      calculatedInternalDeadline: dbItem.calculatedInternalDeadline ? dbItem.calculatedInternalDeadline.toISOString() : undefined,
      finalInternalDeadline: dbItem.finalInternalDeadline ? dbItem.finalInternalDeadline.toISOString() : undefined,
      liveUrl: dbItem.liveUrl || undefined,
      publishedAt: dbItem.publishedAt ? dbItem.publishedAt.toISOString() : undefined,
      createdAt: dbItem.createdAt.toISOString(),
      updatedAt: dbItem.updatedAt.toISOString(),
    };

    // Map Work Sessions
    const mappedWorkSessions: WorkSession[] = workSessionRows.map((ws) => ({
      id: ws.id,
      projectId: ws.projectId,
      contentItemId: ws.contentItemId,
      assignmentId: ws.assignmentId,
      userId: ws.userId,
      startedAt: ws.startedAt.toISOString(),
      endedAt: ws.endedAt ? ws.endedAt.toISOString() : undefined,
      accumulatedSeconds: ws.accumulatedSeconds || 0,
      activeSegmentStartedAt: ws.activeSegmentStartedAt ? ws.activeSegmentStartedAt.toISOString() : null,
      status: ws.status as any,
      adjustments: [],
      notes: ws.notes || undefined,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    }));

    // Map Change Requests
    const mappedChangeRequests: ChangeRequest[] = changeRequestRows.map((cr) => ({
      id: cr.id,
      projectId: cr.projectId,
      contentItemId: cr.contentItemId,
      submissionVersionId: cr.submissionVersionId,
      component: cr.component as any,
      reviewerUserId: cr.reviewerUserId,
      reviewerName: cr.reviewerUserId,
      requestedChange: cr.requestedChange,
      priority: cr.priority as any,
      status: cr.status as any,
      createdAt: cr.createdAt.toISOString(),
    }));

    // Map Approval Decisions
    const mappedDecisions: ApprovalDecision[] = decisionRows.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      contentItemId: d.contentItemId,
      submissionVersionId: d.submissionVersionId,
      component: d.component as any,
      componentFingerprint: d.componentFingerprint || "",
      reviewerUserId: d.reviewerUserId,
      reviewerRole: d.reviewerRole as any,
      decision: d.decision as any,
      note: d.note || undefined,
      decidedAt: d.decidedAt ? d.decidedAt.toISOString() : d.createdAt.toISOString(),
      revokedAt: d.revokedAt ? d.revokedAt.toISOString() : undefined,
      revocationReason: d.revocationReason || undefined,
    }));

    // Map Founder Overrides
    const mappedOverrides: FounderOverride[] = overrideRows.map((ov) => ({
      id: ov.id,
      projectId: ov.projectId,
      contentItemId: ov.contentItemId,
      submissionVersionId: ov.submissionVersionId,
      component: (ov.component as any) || undefined,
      reason: ov.reason,
      actorUserId: ov.actorUserId,
      createdAt: ov.createdAt.toISOString(),
    }));

    // Map Comments
    const mappedComments: Comment[] = commentRows.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      contentItemId: c.contentItemId,
      submissionVersionId: c.submissionVersionId || undefined,
      parentCommentId: c.parentCommentId || undefined,
      authorUserId: c.authorUserId || undefined,
      externalReviewerName: c.externalReviewerName || undefined,
      visibility: (c.visibility || "internal") as "internal" | "external",
      body: c.body,
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : undefined,
      resolvedByUserId: c.resolvedByUserId || undefined,
      createdAt: c.createdAt.toISOString(),
    }));

    // Map Project Members
    const mappedProjectMembers = projectMemberRows.map((pm) => ({
      userId: pm.userId,
      name: pm.fullName || pm.email || pm.userId,
      role: pm.membershipRole || pm.organizationRole || "designer",
      avatar: pm.avatarUrl || undefined,
    }));

    // Map Content Group (if any)
    const contentGroupData = groupRows[0]
      ? {
          id: groupRows[0].id,
          title: groupRows[0].title,
          description: groupRows[0].description || undefined,
          conceptNotes: groupRows[0].conceptNotes || undefined,
        }
      : undefined;

    // Map Siblings
    const siblingGroupItems = siblingRows.map((s) => ({
      id: s.id,
      title: s.title,
      platform: (s.platform || "Instagram") as ContentPlatform,
      contentType: (s.contentType || "post") as ContentType,
      stage: s.stage as ContentStage,
      isEffortAnchor: s.isEffortAnchor || false,
    }));

    profiler.mark("dto-assembly");
    profiler.logSummary();

    return {
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          clientBrand: project.clientBrand || project.name,
          status: project.status,
          engagementModel: project.engagementModel || undefined,
        },
        item: mappedItem,
        contentGroup: contentGroupData,
        siblingGroupItems,
        activeAssignment: mappedActiveAssignment,
        itemWorkSessions: mappedWorkSessions,
        itemVersions: mappedVersions,
        approvalDecisions: mappedDecisions,
        founderOverrides: mappedOverrides,
        changeRequests: mappedChangeRequests,
        comments: mappedComments,
        linkedScript: scriptRows[0] || undefined,
        projectMembers: mappedProjectMembers,
      },
    };
  } catch (err: any) {
    console.error("[getAuthoritativeContentItemDetailAction] Error:", err);
    return { success: false, error: err.message || "Failed to load content item detail" };
  }
}
