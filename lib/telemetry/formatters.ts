/**
 * Canonical Cloudflare Workers Telemetry Formatter
 *
 * Enforces consistent millisecond (ms) reporting across the entire repository.
 *
 * Platform Unit Reference:
 * 1. `wrangler tail --format=json`:
 *    - `cpuTime`: Integer, milliseconds (ms).
 *    - `wallTime`: Integer, milliseconds (ms).
 * 2. Cloudflare GraphQL Analytics (`workersInvocationsAdaptive`):
 *    - `cpuTimeP50`, `wallTimeP50`: Integer, microseconds (µs).
 *    - Must be divided by 1000 to obtain milliseconds (ms).
 */

export interface TailEventMetrics {
  cpuTimeMs: number;
  wallTimeMs: number;
}

export interface GraphqlEventMetrics {
  cpuTimeMs: number;
  wallTimeMs: number;
}

/**
 * Format raw `wrangler tail` event timings.
 * In `wrangler tail`, cpuTime and wallTime are already in milliseconds.
 */
export function parseTailTimings(rawCpuTime: number | undefined | null, rawWallTime: number | undefined | null): TailEventMetrics {
  return {
    cpuTimeMs: Number(rawCpuTime ?? 0),
    wallTimeMs: Number(rawWallTime ?? 0),
  };
}

/**
 * Format raw Cloudflare GraphQL adaptive invocations timings.
 * In GraphQL `workersInvocationsAdaptive`, quantiles are in microseconds (µs).
 */
export function parseGraphqlTimings(rawCpuTimeUs: number | undefined | null, rawWallTimeUs: number | undefined | null): GraphqlEventMetrics {
  return {
    cpuTimeMs: Number(((rawCpuTimeUs ?? 0) / 1000).toFixed(3)),
    wallTimeMs: Number(((rawWallTimeUs ?? 0) / 1000).toFixed(3)),
  };
}

/**
 * Human-readable display string in milliseconds.
 */
export function formatMs(val: number, decimals: number = 2): string {
  return `${val.toFixed(decimals)} ms`;
}
