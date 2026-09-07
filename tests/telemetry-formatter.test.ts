import { describe, it, expect } from "vitest";
import { parseTailTimings, parseGraphqlTimings, formatMs } from "../lib/telemetry/formatters";

describe("Telemetry Formatter Invariants", () => {
  it("correctly handles raw wrangler tail integer millisecond values", () => {
    // e.g. cpuTime: 115, wallTime: 122 from wrangler tail --format=json
    const parsed = parseTailTimings(115, 122);
    expect(parsed.cpuTimeMs).toBe(115);
    expect(parsed.wallTimeMs).toBe(122);
    expect(formatMs(parsed.cpuTimeMs)).toBe("115.00 ms");
    expect(formatMs(parsed.wallTimeMs)).toBe("122.00 ms");
  });

  it("correctly converts GraphQL microsecond values to milliseconds", () => {
    // e.g. cpuTimeP50: 10000 (10 ms cap), wallTimeP50: 122915 (122.915 ms)
    const parsed = parseGraphqlTimings(10000, 122915);
    expect(parsed.cpuTimeMs).toBe(10);
    expect(parsed.wallTimeMs).toBe(122.915);
    expect(formatMs(parsed.cpuTimeMs)).toBe("10.00 ms");
    expect(formatMs(parsed.wallTimeMs)).toBe("122.92 ms");
  });

  it("never outputs microseconds label or misinterprets zero/null", () => {
    const parsed = parseTailTimings(null, undefined);
    expect(parsed.cpuTimeMs).toBe(0);
    expect(parsed.wallTimeMs).toBe(0);
    expect(formatMs(0)).toBe("0.00 ms");
  });
});
