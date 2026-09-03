"use server";

import { db } from "../db";
import { projects, contentItems, contentAssignments, users, projectMemberships, approvalDecisions, submissionVersions, founderOverrides } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";

export interface OrganizationApprovalItem {
  id: string;
  projectId: string;
  projectName: string;
  clientBrand: string;
  title: string;
  platform: string;
  contentType: string;
  stage: string;
  currentVersionNumber: number;
  assignedOwnerId?: string;
  assignedOwnerName?: string;
  assignedOwnerAvatar?: string;
  submissionDeadline?: string;
  approvalTarget?: string;
  copyApprovalStatus: "approved" | "changes_requested" | "pending";
  creativeApprovalStatus: "approved" | "changes_requested" | "pending";
  postingDateApprovalStatus: "approved" | "changes_requested" | "pending";
  consultantStatus: "approved" | "changes_requested" | "pending";
  founderStatus: "approved" | "changes_requested" | "pending";
  overallStatus: "approved" | "in_review" | "changes_requested" | "draft";
}

export async function getAuthoritativeOrganizationApprovalsAction(actorUserId?: string): Promise<{
  success: boolean;
  items: OrganizationApprovalItem[];
  projects: Array<{ id: string; name: string }>;
  teamMembers: Array<{ id: string; name: string }>;
  error?: string;
}> {
  try {
    const user = await getAuthoritativeUser(actorUserId);
    if (!user || user.status !== "active") {
      return { success: false, items: [], projects: [], teamMembers: [], error: "Unauthorized: Active session required" };
    }

    const orgId = user.orgId;
    if (!orgId) {
      return { success: false, items: [], projects: [], teamMembers: [], error: "Unauthorized: Invalid organization context" };
    }

    const isClient = user.organizationRole === "client";
    const isDesigner = user.organizationRole === "designer";

    // 1. Fetch organization projects, memberships, content, assignments, and approval decisions
    const [allProjects, allMemberships, allUsers, allItems, allAssignments, allDecisions] = await Promise.all([
      db.select().from(projects).where(eq(projects.orgId, orgId)),
      db.select().from(projectMemberships).where(eq(projectMemberships.orgId, orgId)),
      db.select().from(users).where(eq(users.orgId, orgId)),
      db.select().from(contentItems).where(eq(contentItems.orgId, orgId)),
      db.select().from(contentAssignments).where(eq(contentAssignments.orgId, orgId)),
      db.select().from(approvalDecisions).where(eq(approvalDecisions.orgId, orgId)),
    ]);

    // 2. Role-based scoping
    let visibleProjects = allProjects;
    if (isClient) {
      const clientMemberships = allMemberships.filter((m) => m.userId === user.id && m.status === "active");
      const clientProjIds = new Set(clientMemberships.map((m) => m.projectId));
      visibleProjects = allProjects.filter((p) => clientProjIds.has(p.id));
    } else if (isDesigner) {
      const designerMemberships = allMemberships.filter((m) => m.userId === user.id && m.status === "active");
      const designerProjIds = new Set(designerMemberships.map((m) => m.projectId));
      visibleProjects = allProjects.filter((p) => designerProjIds.has(p.id));
    }

    const visibleProjIdSet = new Set(visibleProjects.map((p) => p.id));
    const projMap = new Map(visibleProjects.map((p) => [p.id, p]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const filteredItems = allItems.filter((i) => visibleProjIdSet.has(i.projectId));

    const mappedItems: OrganizationApprovalItem[] = filteredItems.map((item) => {
      const proj = projMap.get(item.projectId);
      const activeAssignments = allAssignments.filter(
        (a) => a.contentItemId === item.id && (a.status === "assigned" || a.status === "accepted" || a.status === "in_progress")
      );
      const primaryAssignment = activeAssignments[0];
      const assigneeUser = primaryAssignment ? userMap.get(primaryAssignment.assigneeUserId) : undefined;

      const itemDecisions = allDecisions.filter((d) => d.contentItemId === item.id);
      
      const copyDecisions = itemDecisions.filter((d) => d.component === "copy");
      const creativeDecisions = itemDecisions.filter((d) => d.component === "creative");
      const dateDecisions = itemDecisions.filter((d) => d.component === "posting_date");

      const resolveCompStatus = (decs: typeof itemDecisions) => {
        if (decs.some((d) => d.decision === "rejected" || d.decision === "changes_requested")) return "changes_requested";
        if (decs.some((d) => d.decision === "approved")) return "approved";
        return "pending";
      };

      const copyStatus = resolveCompStatus(copyDecisions);
      const creativeStatus = resolveCompStatus(creativeDecisions);
      const postingDateStatus = resolveCompStatus(dateDecisions);

      const consultantDecisions = itemDecisions.filter((d) => {
        const u = userMap.get(d.reviewerUserId);
        return u?.organizationRole === "consultant";
      });
      const founderDecisions = itemDecisions.filter((d) => {
        const u = userMap.get(d.reviewerUserId);
        return u?.organizationRole === "founder" || u?.organizationRole === "admin";
      });

      const consultantStatus = resolveCompStatus(consultantDecisions);
      const founderStatus = resolveCompStatus(founderDecisions);

      let overallStatus: "approved" | "in_review" | "changes_requested" | "draft" = "draft";
      if (item.stage === "approved" || item.stage === "scheduled" || item.stage === "published") {
        overallStatus = "approved";
      } else if (item.stage === "changes_requested") {
        overallStatus = "changes_requested";
      } else if (item.stage === "in_review" || item.stage === "submitted") {
        overallStatus = "in_review";
      }

      return {
        id: item.id,
        projectId: item.projectId,
        projectName: proj?.name || "Unknown Project",
        clientBrand: proj?.clientName || proj?.name || "",
        title: item.title,
        platform: item.platform,
        contentType: item.contentType,
        stage: item.stage,
        currentVersionNumber: item.currentVersionNumber,
        assignedOwnerId: assigneeUser?.id || undefined,
        assignedOwnerName: assigneeUser?.fullName || undefined,
        assignedOwnerAvatar: assigneeUser?.avatarUrl || undefined,
        submissionDeadline: item.submissionDeadline ? item.submissionDeadline.toISOString() : undefined,
        approvalTarget: item.approvalTarget ? item.approvalTarget.toISOString() : undefined,
        copyApprovalStatus: copyStatus as any,
        creativeApprovalStatus: creativeStatus as any,
        postingDateApprovalStatus: postingDateStatus as any,
        consultantStatus: consultantStatus as any,
        founderStatus: founderStatus as any,
        overallStatus,
      };
    });

    return {
      success: true,
      items: mappedItems,
      projects: visibleProjects.map((p) => ({ id: p.id, name: p.name })),
      teamMembers: allUsers.filter((u) => u.status === "active").map((u) => ({ id: u.id, name: u.fullName })),
    };
  } catch (error: any) {
    return { success: false, items: [], projects: [], teamMembers: [], error: error.message };
  }
}

export async function recordApprovalDecisionAction(params: {
  actorUserId: string;
  submissionVersionId: string;
  component: string;
  decision: "approved" | "changes_requested" | "pending";
  note?: string;
}) {
  try {
    const reviewer = await getAuthoritativeUser(params.actorUserId);
    if (!reviewer) return { success: false, error: "Unauthorized" };

    const [version] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, params.submissionVersionId)).limit(1);
    if (!version) return { success: false, error: "Submission version not found" };

    const [decisionRow] = await db
      .insert(approvalDecisions)
      .values({
        projectId: version.projectId,
        orgId: version.orgId,
        contentItemId: version.contentItemId,
        submissionVersionId: version.id,
        component: params.component,
        componentFingerprint: "fp_" + Math.random().toString(36).substring(2, 9),
        reviewerUserId: reviewer.id,
        reviewerRole: reviewer.organizationRole,
        decision: params.decision,
        note: params.note || null,
        decidedAt: new Date(),
      })
      .returning();

    return { success: true, decision: decisionRow };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function revokeApprovalDecisionAction(params: {
  actorUserId: string;
  decisionId: string;
  reason?: string;
}) {
  try {
    const actor = await getAuthoritativeUser(params.actorUserId);
    if (!actor) return { success: false, error: "Unauthorized" };

    const [updated] = await db
      .update(approvalDecisions)
      .set({
        revokedAt: new Date(),
        revocationReason: params.reason || "Decision revoked",
        revokedByUserId: actor.id,
      })
      .where(eq(approvalDecisions.id, params.decisionId))
      .returning();

    return { success: true, decision: updated };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function recordFounderOverrideAction(params: {
  actorUserId: string;
  contentItemId: string;
  overrideType?: string;
  justification?: string;
  reason?: string;
  submissionVersionId?: string;
}) {
  try {
    const actor = await getAuthoritativeUser(params.actorUserId);
    if (!actor || (actor.organizationRole !== "founder" && actor.organizationRole !== "admin")) {
      return { success: false, error: "Unauthorized: Founder or Admin access required" };
    }

    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, params.contentItemId)).limit(1);
    if (!item) return { success: false, error: "Content item not found" };

    let versionId = params.submissionVersionId;
    if (!versionId) {
      const [latestVersion] = await db
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.contentItemId, item.id))
        .limit(1);
      versionId = latestVersion?.id;
    }

    if (!versionId) {
      const [newVersion] = await db
        .insert(submissionVersions)
        .values({
          projectId: item.projectId,
          orgId: item.orgId,
          contentItemId: item.id,
          versionNumber: 1,
          createdByUserId: actor.id,
        })
        .returning();
      versionId = newVersion.id;
    }

    const [override] = await db
      .insert(founderOverrides)
      .values({
        projectId: item.projectId,
        orgId: item.orgId,
        contentItemId: item.id,
        submissionVersionId: versionId,
        component: params.overrideType || null,
        reason: params.justification || params.reason || "Founder override executed",
        actorUserId: actor.id,
      })
      .returning();

    return { success: true, override };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
