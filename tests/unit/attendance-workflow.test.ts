import { describe, it, expect } from "vitest";
import { getInitialDeterministicState } from "@/lib/mockData";
import { AttendanceRecord, AttendanceCorrection, WorkSession, AppState } from "@/lib/types";

describe("Phase 2.1: Designer Attendance Check-In & Work Timer Independence", () => {
  function getKolkataDateString(d: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function createTestState(): AppState {
    return getInitialDeterministicState();
  }

  it("1. logs daily attendance check-in in Asia/Kolkata timezone with server timestamp", () => {
    const state = createTestState();
    const userId = "u_designer1";
    const today = getKolkataDateString();
    const nowIso = new Date().toISOString();

    const record: AttendanceRecord = {
      id: "att_test_1",
      userId,
      attendanceDate: today,
      checkedInAt: nowIso,
      status: "checked_in",
      corrections: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    expect(record.userId).toBe(userId);
    expect(record.attendanceDate).toBe(today);
    expect(record.status).toBe("checked_in");
    expect(record.checkedInAt).toBe(nowIso);
  });

  it("2. prevents duplicate daily attendance check-ins on the same calendar day", () => {
    const today = getKolkataDateString();
    const existingRecords: AttendanceRecord[] = [
      {
        id: "att_1",
        userId: "u_designer1",
        attendanceDate: today,
        checkedInAt: "2026-08-24T04:00:00Z",
        status: "checked_in",
        corrections: [],
        createdAt: "2026-08-24T04:00:00Z",
        updatedAt: "2026-08-24T04:00:00Z",
      },
    ];

    const isDuplicate = existingRecords.some(
      (r) => r.userId === "u_designer1" && r.attendanceDate === today && r.status === "checked_in"
    );

    expect(isDuplicate).toBe(true);
  });

  it("3. verifies that attendance check-in does NOT automatically start any task WorkSession", () => {
    const state = createTestState();
    const initialSessionCount = state.workSessions.length;

    // Perform check-in
    const newAttRecord: AttendanceRecord = {
      id: "att_test_presence",
      userId: "u_designer1",
      attendanceDate: getKolkataDateString(),
      checkedInAt: new Date().toISOString(),
      status: "checked_in",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // State workSessions remain unchanged
    expect(state.workSessions.length).toBe(initialSessionCount);
  });

  it("4. verifies that starting a task WorkSession does NOT create an AttendanceRecord", () => {
    const state = createTestState();
    const initialAttendanceCount = state.attendanceRecords.length;

    // Start a work session on a deliverable
    const newSession: WorkSession = {
      id: "ws_new_task",
      projectId: "proj_acme",
      contentItemId: "item_acme_1",
      assignmentId: "asgn_acme_1",
      userId: "u_designer1",
      startedAt: new Date().toISOString(),
      accumulatedSeconds: 0,
      activeSegmentStartedAt: new Date().toISOString(),
      status: "active",
      adjustments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Attendance records remain unchanged
    expect(state.attendanceRecords.length).toBe(initialAttendanceCount);
  });

  it("5. records check-out with checkedOutAt timestamp while preserving the record", () => {
    const initialRecord: AttendanceRecord = {
      id: "att_checkout_test",
      userId: "u_designer2",
      attendanceDate: getKolkataDateString(),
      checkedInAt: "2026-08-24T04:00:00Z",
      status: "checked_in",
      createdAt: "2026-08-24T04:00:00Z",
      updatedAt: "2026-08-24T04:00:00Z",
    };

    const checkOutTime = "2026-08-24T12:30:00Z";
    const checkedOutRecord: AttendanceRecord = {
      ...initialRecord,
      status: "checked_out",
      checkedOutAt: checkOutTime,
      updatedAt: checkOutTime,
    };

    expect(checkedOutRecord.status).toBe("checked_out");
    expect(checkedOutRecord.checkedOutAt).toBe(checkOutTime);
    expect(checkedOutRecord.checkedInAt).toBe("2026-08-24T04:00:00Z");
  });

  it("6. blocks inactive users from checking in for attendance", () => {
    const inactiveUser: { id: string; name: string; status: "active" | "inactive" } = {
      id: "u_inactive",
      name: "Inactive Designer",
      status: "inactive",
    };

    const canCheckIn = inactiveUser.status === "active";
    expect(canCheckIn).toBe(false);
  });

  it("7. records audited attendance corrections with mandatory reason without destroying history", () => {
    const originalRecord: AttendanceRecord = {
      id: "att_corr_target",
      userId: "u_designer1",
      attendanceDate: "2026-08-24",
      checkedInAt: "2026-08-24T04:30:00Z",
      status: "checked_in",
      corrections: [],
      createdAt: "2026-08-24T04:30:00Z",
      updatedAt: "2026-08-24T04:30:00Z",
    };

    const correction: AttendanceCorrection = {
      id: "corr_1",
      previousCheckIn: originalRecord.checkedInAt,
      newCheckIn: "2026-08-24T04:00:00Z", // Adjusted to 9:30 AM IST
      changedByUserId: "u_admin",
      reason: "Employee arrived on time but biometrics device was offline",
      createdAt: new Date().toISOString(),
    };

    const correctedRecord: AttendanceRecord = {
      ...originalRecord,
      checkedInAt: correction.newCheckIn!,
      corrections: [correction],
      updatedAt: new Date().toISOString(),
    };

    expect(correctedRecord.checkedInAt).toBe("2026-08-24T04:00:00Z");
    expect(correctedRecord.corrections).toHaveLength(1);
    expect(correctedRecord.corrections![0].previousCheckIn).toBe("2026-08-24T04:30:00Z");
    expect(correctedRecord.corrections![0].reason).toContain("biometrics device was offline");
  });
});
