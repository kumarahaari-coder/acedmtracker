"use server";

import { db } from "../db";
import {
  projects,
  projectMemberships,
  users,
  contentItems,
  contentAssignments,
  approvalDecisions,
  founderOverrides,
} from "../db/schema";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { ContentPlatform, ContentStage, ContentType } from "../types";
import { ExecutionProfiler } from "../observability/profiler";

export interface KanbanCardDTO {
  id: string;
  title: string;
  topic?: string | null;
  workType?: string | null;
  stage: ContentStage;
  platform: ContentPlatform;
  contentType: ContentType;
  priority: string;
  plannedEffortSeconds: number;
  deadlines: {
    submissionDeadline?: string | null;
    scheduledPublicationDate?: string | null;
    internalDeadline?: string | null;
  };
  liveUrl?: string | null;
  productionOwner?: {
    id: string;
    name: string;
    role: string;
    avatarUrl?: string | null;
  } | null;
  approvalSummary: {
    approvedCount: number;
    totalCount: number;
    allComponentsApproved: boolean;
    anyChangesRequested: boolean;
    isOverridden: boolean;
  };
}

export interface KanbanColumnDTO {
  stage: ContentStage;
  title: string;
  cardCount: number;
}

export interface ProjectKanbanDTO {
  project: {
    id: string;
    name: string;
    clientBrand: string;
    status: string;
    projectType: string;
    masterFigmaUrl?: string | null;
  };
  columns: KanbanColumnDTO[];
  cards: KanbanCardDTO[];
}

const KANBAN_STAGES: { stage: ContentStage; title: string }[] = [
  { stage: "draft", title: "1. Drafting" },
  { stage: "submitted", title: "2. Submitted" },
  { stage: "in_review", title: "3. In Review" },
  { stage: "changes_requested", title: "4. Changes Requested" },
  { stage: "approved", title: "5. Approved" },
  { stage: "scheduled", title: "6. Scheduled" },
  { stage: "published", title: "7. Published" },
];

/**
 * Authoritative Project-Scoped Kanban Data Action
 * Strictly bounded by projectId and non-deleted records.
 * Returns cards pre-shaped with approval matrix states.
 */
export async function getAuthoritativeProjectKanbanAction(
  projectId: string,
  actorUserId?: string
): Promise<{
  success: boolean;
  data?: ProjectKanbanDTO;
  error?: string;
}> {
  const profiler = new ExecutionProfiler("getAuthoritativeProjectKanbanAction");

  try {
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) {
      return { success: false, error: "Unauthorized" };
    }
    profiler.mark("auth-resolution");

    if (!projectId) {
      return { success: false, error: "Missing projectId" };
    }

    const orgId = authUser.orgId;
    const isClient = authUser.organizationRole === "client";

    // 1. Fetch project and verify access
    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientBrand: projects.clientName,
        status: projects.status,
        projectType: projects.projectType,
        masterFigmaUrl: projects.masterFigmaUrl,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
      .limit(1);

    if (!project) {
      return { success: false, error: "Project not found or inaccessible" };
    }

    // Client role verification: Must be explicitly assigned to project
    if (isClient) {
      const [membership] = await db
        .select({ id: projectMemberships.id })
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.projectId, projectId),
            eq(projectMemberships.userId, authUser.id),
            eq(projectMemberships.status, "active")
          )
        )
        .limit(1);

      if (!membership) {
        return { success: false, error: "Access denied to this project" };
      }
    }

    // 2. Query scoped deliverables, active assignments, decisions, and overrides in parallel
    const [itemRows, assignmentRows, decisionRows, overrideRows, memberRows] = await Promise.all([
      db
        .select({
          id: contentItems.id,
          title: contentItems.title,
          topic: contentItems.topic,
          workType: contentItems.workType,
          stage: contentItems.stage,
          platform: contentItems.platform,
          contentType: contentItems.contentType,
          priority: contentItems.priority,
          finalPlannedSeconds: contentItems.finalPlannedSeconds,
          submissionDeadline: contentItems.submissionDeadline,
          scheduledPublicationDate: contentItems.scheduledPublicationDate,
          finalInternalDeadline: contentItems.finalInternalDeadline,
          calculatedInternalDeadline: contentItems.calculatedInternalDeadline,
          liveUrl: contentItems.liveUrl,
          accountOwnerId: contentItems.accountOwnerId,
          currentVersionNumber: contentItems.currentVersionNumber,
          createdAt: contentItems.createdAt,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.projectId, projectId),
            eq(contentItems.orgId, orgId),
            isNull(contentItems.deletedAt)
          )
        )
        .orderBy(desc(contentItems.createdAt)),

      db
        .select({
          contentItemId: contentAssignments.contentItemId,
          assigneeUserId: contentAssignments.assigneeUserId,
          assigneeName: users.fullName,
          assigneeRole: users.organizationRole,
          assigneeAvatar: users.avatarUrl,
        })
        .from(contentAssignments)
        .innerJoin(users, eq(users.id, contentAssignments.assigneeUserId))
        .where(
          and(
            eq(contentAssignments.projectId, projectId),
            inArray(contentAssignments.status, ["assigned", "accepted", "in_progress"])
          )
        ),

      db
        .select({
          contentItemId: approvalDecisions.contentItemId,
          submissionVersionId: approvalDecisions.submissionVersionId,
          component: approvalDecisions.component,
          decision: approvalDecisions.decision,
          reviewerRole: approvalDecisions.reviewerRole,
        })
        .from(approvalDecisions)
        .where(
          and(
            eq(approvalDecisions.projectId, projectId),
            isNull(approvalDecisions.revokedAt)
          )
        ),

      db
        .select({
          contentItemId: founderOverrides.contentItemId,
          submissionVersionId: founderOverrides.submissionVersionId,
          component: founderOverrides.component,
        })
        .from(founderOverrides)
        .where(eq(founderOverrides.projectId, projectId)),

      db
        .select({
          id: users.id,
          fullName: users.fullName,
          organizationRole: users.organizationRole,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .innerJoin(projectMemberships, eq(projectMemberships.userId, users.id))
        .where(
          and(
            eq(projectMemberships.projectId, projectId),
            eq(projectMemberships.status, "active")
          )
        ),
    ]);

    profiler.mark(
      "bounded-queries",
      itemRows.length + assignmentRows.length + decisionRows.length + overrideRows.length + memberRows.length
    );

    // 3. Fast In-Memory Map Construction
    const membersMap = new Map<string, { id: string; name: string; role: string; avatarUrl?: string | null }>();
    for (const m of memberRows) {
      membersMap.set(m.id, {
        id: m.id,
        name: m.fullName,
        role: m.organizationRole,
        avatarUrl: m.avatarUrl,
      });
    }

    const assignmentsMap = new Map<string, { id: string; name: string; role: string; avatarUrl?: string | null }>();
    for (const a of assignmentRows) {
      if (!assignmentsMap.has(a.contentItemId)) {
        assignmentsMap.set(a.contentItemId, {
          id: a.assigneeUserId,
          name: a.assigneeName,
          role: a.assigneeRole,
          avatarUrl: a.assigneeAvatar,
        });
      }
    }

    // Index Overrides by contentItemId
    const overridesMap = new Map<string, Array<{ submissionVersionId: string; component: string | null }>>();
    for (const ov of overrideRows) {
      const list = overridesMap.get(ov.contentItemId) || [];
      list.push({ submissionVersionId: ov.submissionVersionId, component: ov.component });
      overridesMap.set(ov.contentItemId, list);
    }

    // Index Decisions by contentItemId
    const decisionsMap = new Map<
      string,
      Array<{
        submissionVersionId: string;
        component: string;
        decision: string;
        reviewerRole: string;
      }>
    >();
    for (const dec of decisionRows) {
      const list = decisionsMap.get(dec.contentItemId) || [];
      list.push({
        submissionVersionId: dec.submissionVersionId,
        component: dec.component,
        decision: dec.decision,
        reviewerRole: dec.reviewerRole,
      });
      decisionsMap.set(dec.contentItemId, list);
    }

    // 4. Shape Cards DTO
    const cards: KanbanCardDTO[] = itemRows.map((item) => {
      // Check Founder Override
      const itemOverrides = overridesMap.get(item.id) || [];
      const isOverridden = itemOverrides.length > 0;

      // Check Component Approval Decisions
      const itemDecisions = decisionsMap.get(item.id) || [];
      const components = ["copy", "creative", "posting_date"] as const;
      let approvedCount = 0;
      let anyChangesRequested = false;

      for (const comp of components) {
        const compDecisions = itemDecisions.filter((d) => d.component === comp);
        const hasApproved = compDecisions.some(
          (d) => d.decision === "approved" || d.decision === "approved_with_conditions"
        );
        const hasChangesReq = compDecisions.some((d) => d.decision === "changes_requested");

        if (hasApproved) approvedCount++;
        if (hasChangesReq) anyChangesRequested = true;
      }

      const allComponentsApproved = approvedCount === 3;
      const owner =
        assignmentsMap.get(item.id) ||
        (item.accountOwnerId ? membersMap.get(item.accountOwnerId) || null : null);

      return {
        id: item.id,
        title: item.title,
        topic: item.topic,
        workType: item.workType,
        stage: item.stage as ContentStage,
        platform: (item.platform || "Instagram") as ContentPlatform,
        contentType: (item.contentType || "post") as ContentType,
        priority: item.priority || "standard",
        plannedEffortSeconds: item.finalPlannedSeconds || 0,
        deadlines: {
          submissionDeadline: item.submissionDeadline ? item.submissionDeadline.toISOString() : null,
          scheduledPublicationDate: item.scheduledPublicationDate
            ? item.scheduledPublicationDate.toISOString()
            : null,
          internalDeadline: item.finalInternalDeadline
            ? item.finalInternalDeadline.toISOString()
            : item.calculatedInternalDeadline
            ? item.calculatedInternalDeadline.toISOString()
            : null,
        },
        liveUrl: item.liveUrl,
        productionOwner: owner,
        approvalSummary: {
          approvedCount,
          totalCount: 3,
          allComponentsApproved,
          anyChangesRequested,
          isOverridden,
        },
      };
    });

    // 5. Shape Columns DTO with Counts
    const isUiDesign = project.projectType === "ui_design";
    const stagesToUse = isUiDesign
      ? [
          { stage: "draft" as ContentStage, title: "1. TO DO" },
          { stage: "submitted" as ContentStage, title: "2. Submitted" },
          { stage: "in_review" as ContentStage, title: "3. Internal Review" },
          { stage: "changes_requested" as ContentStage, title: "4. Changes Requested" },
          { stage: "approved" as ContentStage, title: "5. Approved" },
          { stage: "published" as ContentStage, title: "6. Completed" },
        ]
      : KANBAN_STAGES;

    const columns: KanbanColumnDTO[] = stagesToUse.map((col) => ({
      stage: col.stage,
      title: col.title,
      cardCount: cards.filter((c) => c.stage === col.stage).length,
    }));

    profiler.mark("dto-mapping");
    profiler.logSummary();

    return {
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          clientBrand: project.clientBrand || project.name,
          status: project.status,
          projectType: project.projectType || "digital_marketing",
          masterFigmaUrl: project.masterFigmaUrl || null,
        },
        columns,
        cards,
      },
    };
  } catch (error: any) {
    console.error("[getAuthoritativeProjectKanbanAction] Error:", error);
    profiler.logSummary();
    return {
      success: false,
      error: error.message || "Failed to load project kanban board",
    };
  }
}
