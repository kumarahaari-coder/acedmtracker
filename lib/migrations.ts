import { AppState, StorageEnvelope } from "./types";
import { getEmptyAppState } from "./state/empty";

export const CURRENT_SCHEMA_VERSION = 2;
export const STORAGE_KEY = "ace_tracker_app_state_v2";
export const LEGACY_STORAGE_KEY_V1 = "ace_tracker_app_state_v1";
export const BACKUP_CORRUPTED_KEY = "ace_tracker_corrupted_backup";

export interface MigrationResult {
  state: AppState;
  migrated: boolean;
  recoveredFromCorrupted: boolean;
  error?: string;
}

/**
 * In production, PostgreSQL is the sole authoritative data source.
 * Purges legacy localStorage keys and returns an authoritative empty state.
 */
export function loadStoredState(): MigrationResult {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY_V1);
      localStorage.removeItem(BACKUP_CORRUPTED_KEY);
    } catch {
      // ignore storage access errors
    }
  }

  return {
    state: getEmptyAppState(),
    migrated: false,
    recoveredFromCorrupted: false,
  };
}

export function saveStoredState(_state: AppState): boolean {
  // No-op in PostgreSQL authoritative architecture
  return true;
}

export function resetStoredState(): AppState {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY_V1);
      localStorage.removeItem(BACKUP_CORRUPTED_KEY);
    } catch {}
  }
  return getEmptyAppState();
}
