import { assertNonProductionEnvironment } from "../../lib/guards/environment-safety";

/**
 * Production Safety Guard for E2E / Integration Tests
 * Delegates to canonical assertNonProductionEnvironment guard.
 */
export function enforceTestSafetyGuard(testSuiteName = "E2E Test Suite") {
  assertNonProductionEnvironment(testSuiteName);
}
