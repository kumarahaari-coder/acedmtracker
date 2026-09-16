"use server";

import { db, runTransaction } from "../db";
import { contentAssignments, assignmentDeadlineHistory, contentItems, projects, projectMemberships } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveProjectId, resolveContentItemId, resolveUserId } from "../compat/resolver";

export interface AssignContentItemParams {
  actorUserId: string;
  projectId?: string;
  contentItemId: string;
  assigneeUserId: string;
  assignmentRole?: "designer" | "video_editor" | "collaborator";
  dueAt?: string;
  reason?: string;
}

/**
 * 1. Assign Deliverable Action
 * Restricts creation/reassignment to Founder, Admin, and active Project Consultants.
 * Enforces assignee active membership on project.
 * Atomically marks old assignment as reassigned if replacing an active assignment.
 */
export async function assignContentItemAction(params: AssignContentItemParams) {
  const { actorUserId, contentItemId, assigneeUserId, assignmentRole = "designer", dueAt, reason } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  // Role Gate: Designers and Clients cannot assign/reassign tasks
  if (actor.organizationRole === "designer" || actor.organizationRole === "client") {
    return { success: false, error: "Unauthorized: Designers cannot assign or reassign deliverables." };
  }

  const resolvedItemId = await resolveContentItemId(contentItemId);
  if (!resolvedItemId) return { success: false, error: "Content item not found." };

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, resolvedItemId))
    .limit(1);

  if (!item) return { success: false, error: "Content item not found." };

  // Consultant must have active project membership
  if (actor.organizationRole === "consultant") {
    const access = await requireProjectAccess(actor.id, item.projectId);
    if (!access.allowed) {
      return { success: false, error: "Unauthorized: Consultant does not have access to this project." };
    }
  }

  const resolvedAssigneeId = await resolveUserId(assigneeUserId);
  if (!resolvedAssigneeId) return { success: false, error: "Assignee user not found." };

  // Check that assignee is an active member of the project
  const [membership] = await db
    .select()
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.projectId, item.projectId),
        eq(projectMemberships.userId, resolvedAssigneeId),
        eq(projectMemberships.status, "active")
      )
    )
    .limit(1);

  if (!membership) {
    return { success: false, error: "Assignee is not an active member of this project." };
  }

  const effectiveDueAt = dueAt ? new Date(dueAt) : new Date(Date.now() + 86400000 * 3);
  const now = new Date();

  return runTransaction(async (tx) => {
    // Check for existing active assignment
    const [existing] = await tx
      .select()
      .from(contentAssignments)
      .where(
        and(
          eq(contentAssignments.contentItemId, item.id),
          sql`${contentAssignments.status} IN ('assigned', 'accepted', 'in_progress')`
        )
      )
      .limit(1);

    if (existing && existing.assigneeUserId !== resolvedAssigneeId) {
      // Reassignment: Mark old as 'reassigned'
      await tx
        .update(contentAssignments)
        .set({
          status: "reassigned",
          reassignmentReason: reason || "Reassigned to another team member",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(contentAssignments.id, existing.id));

      const [newAssignment] = await tx
        .insert(contentAssignments)
        .values({
          legacyId: generateLegacyId("asgn"),
          projectId: item.projectId,
          orgId: item.orgId,
          contentItemId: item.id,
          assigneeUserId: resolvedAssigneeId,
          assignmentRole,
          status: "assigned",
          assignedByUserId: actor.id,
          assignedAt: now,
          initialDueAt: effectiveDueAt,
          currentDueAt: effectiveDueAt,
          replacedAssignmentId: existing.id,
        })
        .returning();

      return { success: true, assignment: newAssignment, reassigned: true };
    }

    if (existing) {
      // Update due date if specified
      if (dueAt) {
        await tx
          .update(contentAssignments)
          .set({ currentDueAt: effectiveDueAt, updatedAt: now })
          .where(eq(contentAssignments.id, existing.id));
      }

      return { success: true, assignment: existing, reassigned: false };
    }

    // New initial assignment
    const [newAssignment] = await tx
      .insert(contentAssignments)
      .values({
        legacyId: generateLegacyId("asgn"),
        projectId: item.projectId,
        orgId: item.orgId,
        contentItemId: item.id,
        assigneeUserId: resolvedAssigneeId,
        assignmentRole,
        status: "assigned",
        assignedByUserId: actor.id,
        assignedAt: now,
        initialDueAt: effectiveDueAt,
        currentDueAt: effectiveDueAt,
      })
      .returning();

    return { success: true, assignment: newAssignment, reassigned: false };
  });
}

/**
 * 2. Accept Content Assignment Action
 * Designer accepts their active assignment.
 */
export async function acceptContentAssignmentAction(params: {
  actorUserId: string;
  assignmentId: string;
}) {
  const { actorUserId, assignmentId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const [assignment] = await db
    .select()
    .from(contentAssignments)
    .where(eq(contentAssignments.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, error: "Assignment not found." };

  if (assignment.assigneeUserId !== actor.id) {
    return { success: false, error: "Unauthorized: Only the assigned user can accept this assignment." };
  }

  if (assignment.status === "reassigned") {
    return { success: false, error: "Cannot accept a reassigned assignment." };
  }

  const now = new Date();
  const [updated] = await db
    .update(contentAssignments)
    .set({
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    })
    .where(eq(contentAssignments.id, assignment.id))
    .returning();

  return { success: true, assignment: updated };
}

/**
 * 3. Update Assignment Due Date (Extension) Action
 * Delegates to authoritative atomic internal deadline service:
 * Updates content_items.final_internal_deadline, preserves calculated deadline,
 * synchronizes content_assignments.current_due_at, and records assignment_deadline_history.
 */
export async function updateAssignmentDueDateAction(params: {
  actorUserId: string;
  assignmentId: string;
  newDueAt: string;
  reason: string;
}) {
  const { updateAuthoritativeInternalDeadlineService } = await import("./content");
  return updateAuthoritativeInternalDeadlineService(params);
}
