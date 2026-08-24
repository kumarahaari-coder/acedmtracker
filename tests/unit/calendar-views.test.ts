import { describe, it, expect } from "vitest";

describe("Calendar Views & Multi-Layer Filtering", () => {
  it("calculates correct 7-day week bounds around a reference date", () => {
    const refDate = new Date(2026, 7, 20); // Thursday, Aug 20, 2026
    const dayOfWeek = refDate.getDay(); // 4 (Thursday)

    const startOfWeek = new Date(refDate);
    startOfWeek.setDate(refDate.getDate() - dayOfWeek); // Sunday, Aug 16, 2026

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDays.push(d);
    }

    expect(weekDays.length).toBe(7);
    expect(weekDays[0].getDate()).toBe(16); // Sunday Aug 16
    expect(weekDays[6].getDate()).toBe(22); // Saturday Aug 22
  });
});
