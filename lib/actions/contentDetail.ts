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
 * Consolidated single-roundtrip execution optimized for Vercel + Neon.
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

    // Execute consolidated CTE query fetching project, item, versions, assets, assignments,
    // work sessions, change requests, approvals, overrides, comments, members, group, and siblings
    // in ONE single roundtrip to PostgreSQL.
    const queryRes = await db.execute(sql`
      WITH item_data AS (
        SELECT 
          ci.*,
          p.name as proj_name,
          p.client_name as proj_client_brand,
          p.status as proj_status,
          p.engagement_model as proj_engagement_model
        FROM content_items ci
        JOIN projects p ON p.id = ci.project_id
        WHERE ci.id = ${resolvedItemId}
          AND ci.project_id = ${resolvedProjId}
          AND ci.org_id = ${orgId}
          AND ci.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND p.archived_at IS NULL
      ),
      versions_data AS (
        SELECT sv.*, 
          COALESCE(
            json_agg(
              json_build_object(
                'assetId', ca.id,
                'filename', ca.original_filename,
                'fileSizeBytes', ca.file_size_bytes,
                'mimeType', ca.mime_type,
                'previewUrl', ca.r2_object_key,
                'contentHash', ca.content_hash,
                'storageKey', ca.r2_object_key
              )
            ) FILTER (WHERE ca.id IS NOT NULL), '[]'::json
          ) as assets
        FROM submission_versions sv
        LEFT JOIN submission_assets sa ON sa.submission_version_id = sv.id
        LEFT JOIN creative_assets ca ON ca.id = sa.creative_asset_id
        WHERE sv.content_item_id = ${resolvedItemId}
        GROUP BY sv.id
        ORDER BY sv.version_number ASC
      ),
      assignments_data AS (
        SELECT ca.*, u.full_name as assignee_name, u.email as assignee_email, u.organization_role as assignee_role, u.avatar_url as assignee_avatar
        FROM content_assignments ca
        LEFT JOIN users u ON u.id = ca.assignee_user_id
        WHERE ca.content_item_id = ${resolvedItemId}
        ORDER BY ca.created_at DESC
      ),
      sessions_data AS (
        SELECT * FROM work_sessions
        WHERE content_item_id = ${resolvedItemId}
        ORDER BY started_at DESC
      ),
      changes_data AS (
        SELECT * FROM change_requests
        WHERE content_item_id = ${resolvedItemId}
        ORDER BY created_at DESC
      ),
      decisions_data AS (
        SELECT * FROM approval_decisions
        WHERE content_item_id = ${resolvedItemId} AND revoked_at IS NULL
      ),
      overrides_data AS (
        SELECT * FROM founder_overrides
        WHERE content_item_id = ${resolvedItemId}
      ),
      comments_data AS (
        SELECT * FROM comments
        WHERE content_item_id = ${resolvedItemId}
        ORDER BY created_at ASC
      ),
      members_data AS (
        SELECT pm.user_id, pm.membership_role, u.full_name, u.email, u.avatar_url, u.organization_role
        FROM project_memberships pm
        LEFT JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ${resolvedProjId} AND pm.status = 'active'
      ),
      group_data AS (
        SELECT cg.id, cg.title, cg.description, cg.concept_notes
        FROM content_groups cg
        JOIN item_data i ON i.content_group_id = cg.id
      ),
      siblings_data AS (
        SELECT ci.id, ci.title, ci.platform, ci.content_type, ci.stage, ci.is_effort_anchor
        FROM content_items ci
        JOIN item_data i ON i.content_group_id = ci.content_group_id
        WHERE ci.deleted_at IS NULL
      )
      SELECT 
        (SELECT row_to_json(i) FROM item_data i) as item,
        COALESCE((SELECT json_agg(v) FROM versions_data v), '[]'::json) as versions,
        COALESCE((SELECT json_agg(a) FROM assignments_data a), '[]'::json) as assignments,
        COALESCE((SELECT json_agg(s) FROM sessions_data s), '[]'::json) as work_sessions,
        COALESCE((SELECT json_agg(c) FROM changes_data c), '[]'::json) as change_requests,
        COALESCE((SELECT json_agg(d) FROM decisions_data d), '[]'::json) as approval_decisions,
        COALESCE((SELECT json_agg(o) FROM overrides_data o), '[]'::json) as founder_overrides,
        COALESCE((SELECT json_agg(cm) FROM comments_data cm), '[]'::json) as comments,
        COALESCE((SELECT json_agg(m) FROM members_data m), '[]'::json) as project_members,
        (SELECT row_to_json(g) FROM group_data g) as content_group,
        COALESCE((SELECT json_agg(sib) FROM siblings_data sib), '[]'::json) as sibling_items;
    `);

    profiler.mark("consolidated-query");

    const raw = (queryRes.rows as any[])[0];
    const dbItem = raw?.item;

    if (!dbItem) {
      // Diagnostic check: check if item exists in another project or is deleted
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
    if (isClient && !dbItem.client_visible) {
      return {
        success: false,
        error: "This content deliverable is internal and not visible to clients.",
        forbidden: true,
      };
    }

    if (isClient) {
      const projectMembers = raw.project_members || [];
      const hasAccess = projectMembers.some((m: any) => m.user_id === authUser.id);
      if (!hasAccess) {
        return { success: false, error: "Access denied to this project", forbidden: true };
      }
    }

    const versionRows = raw.versions || [];
    const assignmentRows = raw.assignments || [];
    const workSessionRows = raw.work_sessions || [];
    const changeRequestRows = raw.change_requests || [];
    const decisionRows = raw.approval_decisions || [];
    const overrideRows = raw.founder_overrides || [];
    const commentRows = raw.comments || [];
    const projectMemberRows = raw.project_members || [];
    const contentGroupData = raw.content_group || undefined;
    const siblingRows = raw.sibling_items || [];

    // Map Submission Versions
    const mappedVersions: SubmissionVersion[] = versionRows.map((v: any) => ({
      id: v.id,
      contentItemId: v.content_item_id,
      versionNumber: v.version_number,
      isDraft: v.is_draft,
      submittedAt: v.submitted_at ? new Date(v.submitted_at).toISOString() : undefined,
      createdAt: new Date(v.created_at).toISOString(),
      copy: {
        caption: v.caption || "",
        hashtags: v.hashtags || [],
        cta: v.cta || "",
        destinationUrl: v.destination_url || undefined,
      },
      creativeAssets: (v.assets || []).map((a: any) => ({
        assetId: a.assetId,
        filename: a.filename,
        fileSizeBytes: Number(a.fileSizeBytes || 0),
        mimeType: a.mimeType,
        previewUrl: a.assetId ? `/api/assets/${a.assetId}/preview` : (a.previewUrl || ""),
        contentHash: a.contentHash || "",
        storageKey: a.storageKey || undefined,
      })),
      scheduledDate: v.scheduled_date ? new Date(v.scheduled_date).toISOString() : undefined,
      componentFingerprints: {
        copyFingerprint: v.copy_fingerprint || "",
        creativeFingerprint: v.creative_fingerprint || "",
        postingDateFingerprint: v.posting_date_fingerprint || "",
      },
      createdByUserId: v.created_by_user_id || undefined,
    }));

    // Find active assignment
    const activeAsgn = assignmentRows.find((a: any) => a.status !== "reassigned");
    const mappedActiveAssignment: ContentAssignment | undefined = activeAsgn
      ? {
          id: activeAsgn.id,
          projectId: activeAsgn.project_id,
          contentItemId: activeAsgn.content_item_id,
          assigneeUserId: activeAsgn.assignee_user_id,
          assignmentRole: activeAsgn.assignment_role as any,
          status: activeAsgn.status as any,
          assignedByUserId: activeAsgn.assigned_by_user_id,
          assignedAt: new Date(activeAsgn.created_at).toISOString(),
          initialDueAt: new Date(activeAsgn.initial_due_at).toISOString(),
          currentDueAt: new Date(activeAsgn.current_due_at).toISOString(),
          acceptedAt: activeAsgn.accepted_at ? new Date(activeAsgn.accepted_at).toISOString() : undefined,
          startedAt: activeAsgn.started_at ? new Date(activeAsgn.started_at).toISOString() : undefined,
          completedAt: activeAsgn.completed_at ? new Date(activeAsgn.completed_at).toISOString() : undefined,
          reassignmentReason: activeAsgn.reassignment_reason || undefined,
          createdAt: new Date(activeAsgn.created_at).toISOString(),
          updatedAt: new Date(activeAsgn.updated_at).toISOString(),
        }
      : undefined;

    // Latest submitted version and active draft version
    const submittedVersions = mappedVersions.filter((v) => !v.isDraft && v.submittedAt);
    const latestSubmittedVersion = submittedVersions[submittedVersions.length - 1];
    const draftVersion = mappedVersions.find((v) => v.isDraft);

    // Map Content Item DTO
    const mappedItem: ContentItem = {
      id: dbItem.id,
      projectId: dbItem.project_id,
      contentGroupId: dbItem.content_group_id || undefined,
      title: dbItem.title,
      platform: (dbItem.platform || "Instagram") as ContentPlatform,
      contentType: (dbItem.content_type || "post") as ContentType,
      workType: dbItem.work_type || undefined,
      workTypeId: dbItem.work_type_id || undefined,
      topic: dbItem.topic || undefined,
      stage: dbItem.stage as ContentStage,
      scopeClassification: (dbItem.scope_classification || "contracted") as ScopeClassification,
      workNature: (dbItem.work_nature || "planned") as "planned" | "ad_hoc",
      currentVersionNumber: dbItem.current_version_number,
      latestSubmittedVersionId: latestSubmittedVersion?.id,
      activeDraftVersionId: draftVersion?.id,
      clientVisible: dbItem.client_visible || false,
      accountableOwnerId: mappedActiveAssignment?.assigneeUserId || dbItem.account_owner_id || "",
      collaboratorIds: [],
      standardContentSeconds: dbItem.standard_content_seconds || 0,
      standardProductionSeconds: dbItem.standard_production_seconds || 0,
      finalPlannedSeconds: dbItem.final_planned_seconds || 0,
      isEffortAnchor: dbItem.is_effort_anchor || false,
      deadlines: {
        submissionDeadline: dbItem.submission_deadline ? new Date(dbItem.submission_deadline).toISOString() : undefined,
        scheduledPublicationDate: dbItem.scheduled_publication_date ? new Date(dbItem.scheduled_publication_date).toISOString() : undefined,
        resubmissionDeadline: dbItem.resubmission_deadline ? new Date(dbItem.resubmission_deadline).toISOString() : undefined,
        approvalTarget: dbItem.approval_target ? new Date(dbItem.approval_target).toISOString() : undefined,
      },
      calculatedInternalDeadline: dbItem.calculated_internal_deadline ? new Date(dbItem.calculated_internal_deadline).toISOString() : undefined,
      finalInternalDeadline: dbItem.final_internal_deadline ? new Date(dbItem.final_internal_deadline).toISOString() : undefined,
      liveUrl: dbItem.live_url || undefined,
      publishedAt: dbItem.published_at ? new Date(dbItem.published_at).toISOString() : undefined,
      createdAt: new Date(dbItem.created_at).toISOString(),
      updatedAt: new Date(dbItem.updated_at).toISOString(),
    };

    // Map Work Sessions
    const mappedWorkSessions: WorkSession[] = workSessionRows.map((ws: any) => ({
      id: ws.id,
      projectId: ws.project_id,
      contentItemId: ws.content_item_id,
      assignmentId: ws.assignment_id,
      userId: ws.user_id,
      startedAt: new Date(ws.started_at).toISOString(),
      endedAt: ws.ended_at ? new Date(ws.ended_at).toISOString() : undefined,
      accumulatedSeconds: ws.accumulated_seconds || 0,
      activeSegmentStartedAt: ws.active_segment_started_at ? new Date(ws.active_segment_started_at).toISOString() : null,
      status: ws.status as any,
      adjustments: [],
      notes: ws.notes || undefined,
      createdAt: new Date(ws.created_at).toISOString(),
      updatedAt: new Date(ws.updated_at).toISOString(),
    }));

    // Map Change Requests
    const mappedChangeRequests: ChangeRequest[] = changeRequestRows.map((cr: any) => ({
      id: cr.id,
      projectId: cr.project_id,
      contentItemId: cr.content_item_id,
      submissionVersionId: cr.submission_version_id,
      component: cr.component as any,
      reviewerUserId: cr.reviewer_user_id,
      reviewerName: cr.reviewer_user_id,
      requestedChange: cr.requested_change,
      priority: cr.priority as any,
      status: cr.status as any,
      createdAt: new Date(cr.created_at).toISOString(),
    }));

    // Map Approval Decisions
    const mappedDecisions: ApprovalDecision[] = decisionRows.map((d: any) => ({
      id: d.id,
      projectId: d.project_id,
      contentItemId: d.content_item_id,
      submissionVersionId: d.submission_version_id,
      component: d.component as any,
      componentFingerprint: d.component_fingerprint || "",
      reviewerUserId: d.reviewer_user_id,
      reviewerRole: d.reviewer_role as any,
      decision: d.decision as any,
      note: d.note || undefined,
      decidedAt: d.decided_at ? new Date(d.decided_at).toISOString() : new Date(d.created_at).toISOString(),
      revokedAt: d.revoked_at ? new Date(d.revoked_at).toISOString() : undefined,
      revocationReason: d.revocation_reason || undefined,
    }));

    // Map Founder Overrides
    const mappedOverrides: FounderOverride[] = overrideRows.map((ov: any) => ({
      id: ov.id,
      projectId: ov.project_id,
      contentItemId: ov.content_item_id,
      submissionVersionId: ov.submission_version_id,
      component: (ov.component as any) || undefined,
      reason: ov.reason,
      actorUserId: ov.actor_user_id,
      createdAt: new Date(ov.created_at).toISOString(),
    }));

    // Map Comments
    const mappedComments: Comment[] = commentRows.map((c: any) => ({
      id: c.id,
      projectId: c.project_id,
      contentItemId: c.content_item_id,
      submissionVersionId: c.submission_version_id || undefined,
      parentCommentId: c.parent_comment_id || undefined,
      authorUserId: c.author_user_id || undefined,
      externalReviewerName: c.external_reviewer_name || undefined,
      visibility: (c.visibility || "internal") as "internal" | "external",
      body: c.body,
      resolvedAt: c.resolved_at ? new Date(c.resolved_at).toISOString() : undefined,
      resolvedByUserId: c.resolved_by_user_id || undefined,
      createdAt: new Date(c.created_at).toISOString(),
    }));

    // Map Project Members
    const mappedProjectMembers = projectMemberRows.map((pm: any) => ({
      userId: pm.user_id,
      name: pm.full_name || pm.email || pm.user_id,
      role: pm.membership_role || pm.organization_role || "designer",
      avatar: pm.avatar_url || undefined,
    }));

    // Map Siblings
    const siblingGroupItems = siblingRows.map((s: any) => ({
      id: s.id,
      title: s.title,
      platform: (s.platform || "Instagram") as ContentPlatform,
      contentType: (s.content_type || "post") as ContentType,
      stage: s.stage as ContentStage,
      isEffortAnchor: s.is_effort_anchor || false,
    }));

    profiler.mark("dto-assembly");
    profiler.logSummary();

    return {
      success: true,
      data: {
        project: {
          id: dbItem.project_id,
          name: dbItem.proj_name,
          clientBrand: dbItem.proj_client_brand || dbItem.proj_name,
          status: dbItem.proj_status,
          engagementModel: dbItem.proj_engagement_model || undefined,
        },
        item: mappedItem,
        contentGroup: contentGroupData
          ? {
              id: contentGroupData.id,
              title: contentGroupData.title,
              description: contentGroupData.description || undefined,
              conceptNotes: contentGroupData.concept_notes || undefined,
            }
          : undefined,
        siblingGroupItems,
        activeAssignment: mappedActiveAssignment,
        itemWorkSessions: mappedWorkSessions,
        itemVersions: mappedVersions,
        approvalDecisions: mappedDecisions,
        founderOverrides: mappedOverrides,
        changeRequests: mappedChangeRequests,
        comments: mappedComments,
        linkedScript: undefined,
        projectMembers: mappedProjectMembers,
      },
    };
  } catch (err: any) {
    console.error("[getAuthoritativeContentItemDetailAction] Error:", err);
    return { success: false, error: err.message || "Failed to load content item detail" };
  }
}
