import { describe, it, expect } from "vitest";
import { formatDate, formatTime, formatDateTime } from "@/lib/formatters";

describe("Deterministic Hydration Formatters", () => {
  it("formats dates deterministically regardless of client environment", () => {
    const isoString = "2026-08-21T10:00:00.000Z";
    const formatted = formatDate(isoString);

    expect(formatted).toBe("21 Aug 2026");
  });

  it("formats time values deterministically in 12-hour format with Asia/Kolkata timezone", () => {
    const isoString = "2026-08-21T10:00:00.000Z";
    const formattedTime = formatTime(isoString);

    // 10:00 UTC is 15:30 (03:30 pm) in Asia/Kolkata
    expect(formattedTime.toLowerCase()).toContain("03:30");
  });

  it("handles null, undefined, and empty string safely without throwing", () => {
    expect(formatDate(null)).toBe("Unset");
    expect(formatDate(undefined)).toBe("Unset");
    expect(formatTime(null)).toBe("");
    expect(formatTime(undefined)).toBe("");
    expect(formatDateTime(null)).toBe("Unset");
  });
});
