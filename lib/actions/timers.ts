"use server";

import { db, runTransaction } from "../db";
import { workSessions, workSessionAdjustments, contentAssignments, contentItems, projects } from "../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveAssignmentId, resolveContentItemId } from "../compat/resolver";

/**
 * 1. Start Work Session Action
 * Authoritative Server-owned timer.
 * Enforces invariant: No overlapping active work sessions for the same user.
 * Automatically pauses any previous active session for this user before starting new one.
 */
export async function startWorkSessionAction(params: {
  actorUserId: string;
  assignmentId: string;
  notes?: string;
}) {
  const { actorUserId, assignmentId, notes } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const resolvedAsgnId = await resolveAssignmentId(assignmentId);
  if (!resolvedAsgnId) return { success: false, error: "Assignment not found." };

  const [assignment] = await db
    .select()
    .from(contentAssignments)
    .where(eq(contentAssignments.id, resolvedAsgnId))
    .limit(1);

  if (!assignment) return { success: false, error: "Assignment not found." };

  const now = new Date();

  return runTransaction(async (tx) => {
    // 1. Pause any currently active work session for this user
    const [activeSession] = await tx
      .select()
      .from(workSessions)
      .where(
        and(
          eq(workSessions.userId, actor.id),
          eq(workSessions.status, "active")
        )
      )
      .limit(1);

    if (activeSession) {
      const segmentElapsed = activeSession.activeSegmentStartedAt
        ? Math.floor((now.getTime() - new Date(activeSession.activeSegmentStartedAt).getTime()) / 1000)
        : 0;
      const newAccumulated = activeSession.accumulatedSeconds + Math.max(0, segmentElapsed);

      await tx
        .update(workSessions)
        .set({
          status: "paused",
          accumulatedSeconds: newAccumulated,
          activeSegmentStartedAt: null,
          updatedAt: now,
        })
        .where(eq(workSessions.id, activeSession.id));
    }

    // 2. Check if a paused session already exists for this assignment
    const [existingAsgnSession] = await tx
      .select()
      .from(workSessions)
      .where(
        and(
          eq(workSessions.assignmentId, assignment.id),
          eq(workSessions.userId, actor.id),
          eq(workSessions.status, "paused")
        )
      )
      .limit(1);

    let sessionRecord;

    if (existingAsgnSession) {
      // Resume existing session
      const [resumed] = await tx
        .update(workSessions)
        .set({
          status: "active",
          activeSegmentStartedAt: now,
          updatedAt: now,
        })
        .where(eq(workSessions.id, existingAsgnSession.id))
        .returning();
      sessionRecord = resumed;
    } else {
      // Create new active work session
      const [created] = await tx
        .insert(workSessions)
        .values({
          legacyId: generateLegacyId("ws"),
          projectId: assignment.projectId,
          orgId: assignment.orgId,
          contentItemId: assignment.contentItemId,
          assignmentId: assignment.id,
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
    if (assignment.status === "assigned" || assignment.status === "accepted") {
      await tx
        .update(contentAssignments)
        .set({
          status: "in_progress",
          startedAt: assignment.startedAt || now,
          updatedAt: now,
        })
        .where(eq(contentAssignments.id, assignment.id));
    }

    return { success: true, workSession: sessionRecord };
  });
}

/**
 * 2. Pause Work Session Action
 */
export async function pauseWorkSessionAction(params: {
  actorUserId: string;
  workSessionId: string;
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
 * 3. Stop / Complete Work Session Action
 */
export async function stopWorkSessionAction(params: {
  actorUserId: string;
  workSessionId: string;
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
export async function getActiveWorkSessionAction(params: { actorUserId: string }) {
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
  actorUserId: string;
  workSessionId: string;
  newDurationSeconds: number;
  reason: string;
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
