"use server";

import { db, runTransaction } from "../db";
import { workSessions, workSessionAdjustments, contentAssignments, contentItems, projects, projectMemberships } from "../db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveAssignmentId, resolveContentItemId } from "../compat/resolver";

export type TimerErrorCode =
  | "ASSIGNMENT_NOT_FOUND"
  | "ACTIVE_TIMER_CONFLICT"
  | "PROJECT_ACCESS_DENIED"
  | "DELIVERABLE_INACTIVE"
  | "UNAUTHORIZED";

export interface StartWorkSessionParams {
  contentItemId?: string;
  assignmentId?: string;
  actorUserId?: string;
  notes?: string;
}

export interface StartWorkSessionResult {
  success: boolean;
  code?: TimerErrorCode;
  error?: string;
  activeTaskTitle?: string;
  workSession?: any;
  assignment?: any;
}

/**
 * 1. Start Work Session Action
 * Authoritative Server-owned timer.
 * Preferred contract: startWorkSessionAction({ contentItemId })
 * Resolves authenticated user, canonical assignment, validates active project membership,
 * verifies deliverable is not deleted/archived, strictly enforces 1 active timer per user,
 * and atomically transitions assignment from 'assigned'/'accepted' to 'in_progress'.
 */
export async function startWorkSessionAction(
  params: StartWorkSessionParams
): Promise<StartWorkSessionResult> {
  const { contentItemId, assignmentId, actorUserId, notes } = params;

  // 1. Resolve authoritative user
  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) {
    return { success: false, code: "UNAUTHORIZED", error: "Unauthorized." };
  }

  // 2. Resolve assignment authoritatively
  let resolvedItemId: string | undefined = undefined;
  if (contentItemId) {
    resolvedItemId = (await resolveContentItemId(contentItemId)) || contentItemId;
  }

  let assignment: typeof contentAssignments.$inferSelect | undefined = undefined;

  if (resolvedItemId) {
    const [found] = await db
      .select()
      .from(contentAssignments)
      .where(
        and(
          eq(contentAssignments.contentItemId, resolvedItemId),
          eq(contentAssignments.assigneeUserId, actor.id),
          inArray(contentAssignments.status, ["assigned", "accepted", "in_progress"])
        )
      )
      .limit(1);
    assignment = found;
  }

  if (!assignment && assignmentId) {
    const resolvedAsgnId = (await resolveAssignmentId(assignmentId)) || assignmentId;
    const [found] = await db
      .select()
      .from(contentAssignments)
      .where(
        and(
          eq(contentAssignments.id, resolvedAsgnId),
          eq(contentAssignments.assigneeUserId, actor.id),
          inArray(contentAssignments.status, ["assigned", "accepted", "in_progress"])
        )
      )
      .limit(1);
    assignment = found;
  }

  if (!assignment) {
    return {
      success: false,
      code: "ASSIGNMENT_NOT_FOUND",
      error: "Assignment not found for this deliverable.",
    };
  }

  // 3. Ensure deliverable is active and not deleted/archived
  const [item] = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      status: contentItems.status,
      deletedAt: contentItems.deletedAt,
      projectId: contentItems.projectId,
    })
    .from(contentItems)
    .where(eq(contentItems.id, assignment.contentItemId))
    .limit(1);

  if (!item || item.deletedAt !== null || item.status === "archived") {
    return {
      success: false,
      code: "DELIVERABLE_INACTIVE",
      error: "Deliverable is inactive or archived.",
    };
  }

  // 4. Ensure project membership is active
  const [membership] = await db
    .select({ id: projectMemberships.id })
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.projectId, assignment.projectId),
        eq(projectMemberships.userId, actor.id),
        eq(projectMemberships.status, "active")
      )
    )
    .limit(1);

  if (!membership) {
    return {
      success: false,
      code: "PROJECT_ACCESS_DENIED",
      error: "Active project membership required to track work on this project.",
    };
  }

  // 5. Concurrency Invariant: Check whether THIS USER already has another active work session
  const [activeSession] = await db
    .select({
      id: workSessions.id,
      assignmentId: workSessions.assignmentId,
      contentItemId: workSessions.contentItemId,
      title: contentItems.title,
    })
    .from(workSessions)
    .leftJoin(contentItems, eq(workSessions.contentItemId, contentItems.id))
    .where(
      and(
        eq(workSessions.userId, actor.id),
        eq(workSessions.status, "active")
      )
    )
    .limit(1);

  if (activeSession && activeSession.assignmentId !== assignment.id) {
    return {
      success: false,
      code: "ACTIVE_TIMER_CONFLICT",
      activeTaskTitle: activeSession.title || "another deliverable",
      error: `Active timer already running on '${activeSession.title || "another deliverable"}'. Please pause or stop it first.`,
    };
  }

  const now = new Date();

  return runTransaction(async (tx) => {
    // Check if session for this assignment is already active
    if (activeSession && activeSession.assignmentId === assignment!.id) {
      const [current] = await tx
        .select()
        .from(workSessions)
        .where(eq(workSessions.id, activeSession.id))
        .limit(1);
      return { success: true, workSession: current, assignment };
    }

    // Check if a paused session already exists for this assignment
    const [existingPausedSession] = await tx
      .select()
      .from(workSessions)
      .where(
        and(
          eq(workSessions.assignmentId, assignment!.id),
          eq(workSessions.userId, actor.id),
          eq(workSessions.status, "paused")
        )
      )
      .limit(1);

    let sessionRecord;

    if (existingPausedSession) {
      // Resume existing session
      const [resumed] = await tx
        .update(workSessions)
        .set({
          status: "active",
          activeSegmentStartedAt: now,
          updatedAt: now,
        })
        .where(eq(workSessions.id, existingPausedSession.id))
        .returning();
      sessionRecord = resumed;
    } else {
      // Create new active work session
      const [created] = await tx
        .insert(workSessions)
        .values({
          legacyId: generateLegacyId("ws"),
          projectId: assignment!.projectId,
          orgId: assignment!.orgId,
          contentItemId: assignment!.contentItemId,
          assignmentId: assignment!.id,
          userId: actor.id,
          startedAt: now,
          accumulatedSeconds: 0,
          activeSegmentStartedAt: now,
          status: "active",
          notes,
        })
        .returning();
      sessionRecord = created;
    }

    // Advance assignment status to 'in_progress' if currently 'assigned' or 'accepted'
    let updatedAssignment = assignment!;
    if (assignment!.status === "assigned" || assignment!.status === "accepted") {
      const [updated] = await tx
        .update(contentAssignments)
        .set({
          status: "in_progress",
          startedAt: assignment!.startedAt || now,
          updatedAt: now,
        })
        .where(eq(contentAssignments.id, assignment!.id))
        .returning();
      updatedAssignment = updated;
    }

    return { success: true, workSession: sessionRecord, assignment: updatedAssignment };
  });
}

/**
 * 2. Pause Work Session Action
 */
export async function pauseWorkSessionAction(params: {
  workSessionId: string;
  actorUserId?: string;
}) {
  const { actorUserId, workSessionId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const [session] = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.id, workSessionId))
    .limit(1);

  if (!session) return { success: false, error: "Work session not found." };
  if (session.status !== "active") return { success: true, workSession: session };

  const now = new Date();
  const segmentElapsed = session.activeSegmentStartedAt
    ? Math.floor((now.getTime() - new Date(session.activeSegmentStartedAt).getTime()) / 1000)
    : 0;
  const newAccumulated = session.accumulatedSeconds + Math.max(0, segmentElapsed);

  const [updated] = await db
    .update(workSessions)
    .set({
      status: "paused",
      accumulatedSeconds: newAccumulated,
      activeSegmentStartedAt: null,
      updatedAt: now,
    })
    .where(eq(workSessions.id, session.id))
    .returning();

  return { success: true, workSession: updated };
}

/**
 * 2b. Resume Work Session Action
 */
export async function resumeWorkSessionAction(params: {
  workSessionId: string;
  actorUserId?: string;
}) {
  const { actorUserId, workSessionId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, code: "UNAUTHORIZED" as const, error: "Unauthorized." };

  const [session] = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.id, workSessionId))
    .limit(1);

  if (!session) return { success: false, code: "ASSIGNMENT_NOT_FOUND" as const, error: "Work session not found." };
  if (session.status === "active") return { success: true, workSession: session };

  // Concurrency check: check if another session is already active
  const [activeSession] = await db
    .select({
      id: workSessions.id,
      title: contentItems.title,
    })
    .from(workSessions)
    .leftJoin(contentItems, eq(workSessions.contentItemId, contentItems.id))
    .where(
      and(
        eq(workSessions.userId, actor.id),
        eq(workSessions.status, "active")
      )
    )
    .limit(1);

  if (activeSession && activeSession.id !== session.id) {
    return {
      success: false,
      code: "ACTIVE_TIMER_CONFLICT" as const,
      activeTaskTitle: activeSession.title || "another deliverable",
      error: `Active timer already running on '${activeSession.title || "another deliverable"}'. Please pause or stop it first.`,
    };
  }

  const now = new Date();
  const [resumed] = await db
    .update(workSessions)
    .set({
      status: "active",
      activeSegmentStartedAt: now,
      updatedAt: now,
    })
    .where(eq(workSessions.id, session.id))
    .returning();

  return { success: true, workSession: resumed };
}

/**
 * 3. Stop / Complete Work Session Action
 */
export async function stopWorkSessionAction(params: {
  workSessionId: string;
  actorUserId?: string;
}) {
  const { actorUserId, workSessionId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const [session] = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.id, workSessionId))
    .limit(1);

  if (!session) return { success: false, error: "Work session not found." };

  const now = new Date();
  let finalAccumulated = session.accumulatedSeconds;
  if (session.status === "active" && session.activeSegmentStartedAt) {
    const segmentElapsed = Math.floor((now.getTime() - new Date(session.activeSegmentStartedAt).getTime()) / 1000);
    finalAccumulated += Math.max(0, segmentElapsed);
  }

  const [completed] = await db
    .update(workSessions)
    .set({
      status: "completed",
      accumulatedSeconds: finalAccumulated,
      activeSegmentStartedAt: null,
      endedAt: now,
      updatedAt: now,
    })
    .where(eq(workSessions.id, session.id))
    .returning();

  return { success: true, workSession: completed };
}

/**
 * 4. Get Current Active Work Session Action (Browser Refresh Recovery)
 */
export async function getActiveWorkSessionAction(params: { actorUserId?: string }) {
  const { actorUserId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const [activeSession] = await db
    .select()
    .from(workSessions)
    .where(
      and(
        eq(workSessions.userId, actor.id),
        eq(workSessions.status, "active")
      )
    )
    .limit(1);

  if (!activeSession) return { success: true, activeSession: null };

  const now = new Date();
  const currentElapsed = activeSession.activeSegmentStartedAt
    ? Math.floor((now.getTime() - new Date(activeSession.activeSegmentStartedAt).getTime()) / 1000)
    : 0;

  return {
    success: true,
    activeSession: {
      ...activeSession,
      liveElapsedSeconds: activeSession.accumulatedSeconds + Math.max(0, currentElapsed),
    },
  };
}

/**
 * 5. Adjust Work Session Duration Action
 */
export async function adjustWorkSessionDurationAction(params: {
  workSessionId: string;
  newDurationSeconds: number;
  reason: string;
  actorUserId?: string;
}) {
  const { actorUserId, workSessionId, newDurationSeconds, reason } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  if (actor.organizationRole !== "founder" && actor.organizationRole !== "admin" && actor.organizationRole !== "consultant") {
    return { success: false, error: "Unauthorized: Only management can adjust work session duration." };
  }

  const [session] = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.id, workSessionId))
    .limit(1);

  if (!session) return { success: false, error: "Work session not found." };

  const now = new Date();

  return runTransaction(async (tx) => {
    await tx.insert(workSessionAdjustments).values({
      workSessionId: session.id,
      projectId: session.projectId,
      orgId: session.orgId,
      previousDurationSeconds: session.accumulatedSeconds,
      adjustedDurationSeconds: newDurationSeconds,
      reason,
      adjustedByUserId: actor.id,
      adjustedAt: now,
    });

    const [updated] = await tx
      .update(workSessions)
      .set({
        accumulatedSeconds: newDurationSeconds,
        updatedAt: now,
      })
      .where(eq(workSessions.id, session.id))
      .returning();

    return { success: true, workSession: updated };
  });
}
