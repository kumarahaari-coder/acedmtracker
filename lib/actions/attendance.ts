import { db, runTransaction } from "../db";
import { attendanceRecords, attendanceCorrections, users } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { generateLegacyId } from "../compat/resolver";

function getTodayIST(): string {
  const now = new Date();
  // Formats to YYYY-MM-DD in Asia/Kolkata timezone
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * 1. Daily Check-In Action
 */
export async function checkInAction(params: { actorUserId: string }) {
  const { actorUserId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const todayStr = getTodayIST();
  const now = new Date();

  // Check if attendance already recorded today
  const [existing] = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.userId, actor.id),
        eq(attendanceRecords.attendanceDate, todayStr as any)
      )
    )
    .limit(1);

  if (existing) {
    return { success: true, record: existing, alreadyCheckedIn: true };
  }

  const [record] = await db
    .insert(attendanceRecords)
    .values({
      legacyId: generateLegacyId("att"),
      orgId: actor.orgId,
      userId: actor.id,
      attendanceDate: todayStr as any,
      checkedInAt: now,
      status: "checked_in",
    })
    .returning();

  return { success: true, record, alreadyCheckedIn: false };
}

/**
 * 2. Daily Check-Out Action
 */
export async function checkOutAction(params: { actorUserId: string }) {
  const { actorUserId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const todayStr = getTodayIST();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.userId, actor.id),
        eq(attendanceRecords.attendanceDate, todayStr as any)
      )
    )
    .limit(1);

  if (!existing) {
    return { success: false, error: "No active check-in found for today. Please check in first." };
  }

  const [updated] = await db
    .update(attendanceRecords)
    .set({
      checkedOutAt: now,
      status: "checked_out",
      updatedAt: now,
    })
    .where(eq(attendanceRecords.id, existing.id))
    .returning();

  return { success: true, record: updated };
}

/**
 * 3. Correct Attendance Action (Management Only)
 */
export async function correctAttendanceAction(params: {
  actorUserId: string;
  attendanceRecordId: string;
  newCheckIn?: string;
  newCheckOut?: string;
  reason: string;
}) {
  const { actorUserId, attendanceRecordId, newCheckIn, newCheckOut, reason } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  if (actor.organizationRole !== "founder" && actor.organizationRole !== "admin") {
    return { success: false, error: "Unauthorized: Only Founder or Admin can correct attendance records." };
  }

  const [record] = await db
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.id, attendanceRecordId))
    .limit(1);

  if (!record) return { success: false, error: "Attendance record not found." };

  const now = new Date();

  return runTransaction(async (tx) => {
    await tx.insert(attendanceCorrections).values({
      attendanceRecordId: record.id,
      orgId: record.orgId,
      userId: record.userId,
      previousCheckIn: record.checkedInAt,
      newCheckIn: newCheckIn ? new Date(newCheckIn) : record.checkedInAt,
      previousCheckOut: record.checkedOutAt,
      newCheckOut: newCheckOut ? new Date(newCheckOut) : record.checkedOutAt,
      changedByUserId: actor.id,
      reason,
      createdAt: now,
    });

    const [updated] = await tx
      .update(attendanceRecords)
      .set({
        checkedInAt: newCheckIn ? new Date(newCheckIn) : record.checkedInAt,
        checkedOutAt: newCheckOut ? new Date(newCheckOut) : record.checkedOutAt,
        updatedAt: now,
      })
      .where(eq(attendanceRecords.id, record.id))
      .returning();

    return { success: true, record: updated };
  });
}
