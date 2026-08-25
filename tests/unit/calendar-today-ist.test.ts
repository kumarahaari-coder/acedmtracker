import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCurrentISTDate } from "@/lib/formatters";

describe("Calendar Today IST Runtime Resolution (CAL-001)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. Resolves current date strictly in Asia/Kolkata timezone", () => {
    // Mock a specific UTC time: 2026-08-25T02:30:00Z -> In IST (+5:30) it is 2026-08-25 08:00 AM
    const mockDate = new Date("2026-08-25T02:30:00Z");
    const res = getCurrentISTDate(mockDate);

    expect(res.year).toBe(2026);
    expect(res.month).toBe(7); // 0-indexed August
    expect(res.day).toBe(25);
    expect(res.dateString).toBe("2026-08-25");
  });

  it("2. Handles UTC vs IST date boundary rollover correctly", () => {
    // 2026-08-24T20:00:00Z -> UTC is August 24, but in IST (+5:30) it is 2026-08-25 01:30 AM
    const boundaryDate = new Date("2026-08-24T20:00:00Z");
    const res = getCurrentISTDate(boundaryDate);

    expect(res.day).toBe(25);
    expect(res.month).toBe(7); // August
    expect(res.year).toBe(2026);
    expect(res.dateString).toBe("2026-08-25");
  });

  it("3. Ignores stale mock dates (e.g. 21) when today is 25", () => {
    const mockDate = new Date("2026-08-25T06:00:00Z");
    const res = getCurrentISTDate(mockDate);

    expect(res.day).toBe(25);
    expect(res.day).not.toBe(21);
  });

  it("4. Month mismatch prevents false today highlighting for the same day number", () => {
    const today = getCurrentISTDate(new Date("2026-08-25T06:00:00Z"));

    // Check against July 25 (month = 6)
    const JulyMonth = 6;
    const isTodayInJuly = 25 === today.day && JulyMonth === today.month && 2026 === today.year;
    expect(isTodayInJuly).toBe(false);

    // Check against August 25 (month = 7)
    const AugustMonth = 7;
    const isTodayInAugust = 25 === today.day && AugustMonth === today.month && 2026 === today.year;
    expect(isTodayInAugust).toBe(true);
  });

  it("5. Exactly one date cell matches today in the current month", () => {
    const today = getCurrentISTDate(new Date("2026-08-25T06:00:00Z"));
    const currentMonth = 7;
    const currentYear = 2026;

    let matchCount = 0;
    for (let d = 1; d <= 31; d++) {
      if (d === today.day && currentMonth === today.month && currentYear === today.year) {
        matchCount++;
      }
    }

    expect(matchCount).toBe(1);
  });

  it("6. Dynamic date change updates the today marker calculation", () => {
    const day1 = getCurrentISTDate(new Date("2026-08-25T10:00:00Z"));
    expect(day1.day).toBe(25);

    const day2 = getCurrentISTDate(new Date("2026-08-26T10:00:00Z"));
    expect(day2.day).toBe(26);
    expect(day2.dateString).toBe("2026-08-26");
  });
});
