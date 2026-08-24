import { AppState, StorageEnvelope } from "./types";
import { getInitialDeterministicState } from "./mockData";

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

function migrateSvgUrl(url: string | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:image/svg+xml;utf8,<svg")) {
    const rawSvg = url.substring("data:image/svg+xml;utf8,".length);
    const cleanSvg = rawSvg.replace(/&(?!(amp;|lt;|gt;|quot;|apos;))/g, "&amp;");
    return `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`;
  }
  return url;
}

// Migration registry for version upgrades
const migrations: Record<number, (oldData: any) => AppState> = {
  1: (data: any) => data as AppState,
  2: (data: any) => {
    // Schema v2 migration: Migrate unencoded or raw SVG preview URLs
    const state = { ...data } as AppState;
    if (Array.isArray(state.submissionVersions)) {
      state.submissionVersions = state.submissionVersions.map((v) => ({
        ...v,
        creativeAssets: Array.isArray(v.creativeAssets)
          ? v.creativeAssets.map((a) => ({
              ...a,
              previewUrl: migrateSvgUrl(a.previewUrl),
            }))
          : [],
      }));
    }
    if (Array.isArray(state.assets)) {
      state.assets = state.assets.map((a) => ({
        ...a,
        previewUrl: migrateSvgUrl(a.previewUrl),
      }));
    }
    return state;
  },
};

function isValidEnvelope(obj: any): obj is StorageEnvelope<AppState> {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.schemaVersion !== "number") return false;
  if (typeof obj.seededAt !== "string") return false;
  if (typeof obj.updatedAt !== "string") return false;
  if (!obj.data || typeof obj.data !== "object") return false;

  const d = obj.data;
  return (
    Array.isArray(d.users) &&
    Array.isArray(d.projects) &&
    Array.isArray(d.projectMemberships) &&
    Array.isArray(d.contentItems) &&
    Array.isArray(d.submissionVersions) &&
    Array.isArray(d.approvalDecisions) &&
    Array.isArray(d.changeRequests) &&
    Array.isArray(d.auditRecords)
  );
}

export function loadStoredState(): MigrationResult {
  if (typeof window === "undefined") {
    return {
      state: getInitialDeterministicState(),
      migrated: false,
      recoveredFromCorrupted: false,
    };
  }

  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    let isLegacy = false;

    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
      if (raw) isLegacy = true;
    }

    if (!raw) {
      const initial = getInitialDeterministicState();
      saveStoredState(initial);
      return {
        state: initial,
        migrated: false,
        recoveredFromCorrupted: false,
      };
    }

    const parsed = JSON.parse(raw);
    if (!isValidEnvelope(parsed)) {
      // Preserve corrupted payload if storage permits
      try {
        localStorage.setItem(BACKUP_CORRUPTED_KEY, raw.substring(0, 50000));
      } catch {
        // ignore quota failure on backup
      }
      const restored = getInitialDeterministicState();
      saveStoredState(restored);
      return {
        state: restored,
        migrated: false,
        recoveredFromCorrupted: true,
        error: "Stored state failed structural schema validation. Deterministic baseline restored.",
      };
    }

    let state = parsed.data;
    let migrated = isLegacy;

    if (parsed.schemaVersion < CURRENT_SCHEMA_VERSION) {
      for (let v = parsed.schemaVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
        if (migrations[v]) {
          state = migrations[v](state);
          migrated = true;
        }
      }
    }

    if (migrated) {
      saveStoredState(state);
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY_V1);
      } catch {}
    }

    return {
      state,
      migrated,
      recoveredFromCorrupted: false,
    };
  } catch (err: any) {
    const restored = getInitialDeterministicState();
    try {
      saveStoredState(restored);
    } catch {
      // storage unavailable
    }
    return {
      state: restored,
      migrated: false,
      recoveredFromCorrupted: true,
      error: `Parse error: ${err?.message || "Unknown error"}. Deterministic baseline restored.`,
    };
  }
}

export function saveStoredState(state: AppState): boolean {
  if (typeof window === "undefined") return false;

  const envelope: StorageEnvelope<AppState> = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    seededAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: state,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch (e: any) {
    console.error("Failed to write to localStorage (quota or disabled):", e);
    return false;
  }
}

export function resetStoredState(): AppState {
  const fresh = getInitialDeterministicState();
  saveStoredState(fresh);
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY_V1);
  } catch {}
  return fresh;
}
