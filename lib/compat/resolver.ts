import { db } from "../db";
import {
  projects,
  contentItems,
  submissionVersions,
  users,
  contentAssignments,
  approvalDecisions,
  changeRequests,
  workSessions,
  campaigns,
  scripts,
} from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Generates a stable deterministic legacy-compatible ID for newly created entities
 * during the dual-mode transition.
 */
export function generateLegacyId(
  prefix:
    | "item"
    | "ver"
    | "grp"
    | "asset"
    | "asgn"
    | "dec"
    | "ovr"
    | "cr"
    | "ws"
    | "att"
    | "comm"
    | "annot"
    | "tok"
    | "camp"
    | "scr"
): string {
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${randomStr}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a Project identifier (UUID or legacy_id) to the canonical database UUID
 */
export async function resolveProjectId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  const isUuid = UUID_REGEX.test(identifier);

  const result = await db
    .select({ id: projects.id })
    .from(projects)
    .where(isUuid ? eq(projects.id, identifier) : eq(projects.legacyId, identifier))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Resolves a ContentItem identifier (UUID or legacy_id) to the canonical database UUID
 */
export async function resolveContentItemId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  const isUuid = UUID_REGEX.test(identifier);

  const result = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(isUuid ? eq(contentItems.id, identifier) : eq(contentItems.legacyId, identifier))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Resolves a SubmissionVersion identifier (UUID or legacy_id) to the canonical database UUID
 */
export async function resolveSubmissionVersionId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  const isUuid = UUID_REGEX.test(identifier);

  const result = await db
    .select({ id: submissionVersions.id })
    .from(submissionVersions)
    .where(isUuid ? eq(submissionVersions.id, identifier) : eq(submissionVersions.legacyId, identifier))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Resolves a User identifier (UUID or legacy_id) to the canonical database UUID
 */
export async function resolveUserId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  const isUuid = UUID_REGEX.test(identifier);

  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(isUuid ? eq(users.id, identifier) : eq(users.legacyId, identifier))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Resolves a ContentAssignment identifier (UUID or legacy_id) to the canonical database UUID
 */
export async function resolveAssignmentId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  const isUuid = UUID_REGEX.test(identifier);

  const result = await db
    .select({ id: contentAssignments.id })
    .from(contentAssignments)
    .where(isUuid ? eq(contentAssignments.id, identifier) : eq(contentAssignments.legacyId, identifier))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Resolves a ChangeRequest identifier (UUID or legacy_id) to the canonical database UUID
 */
export async function resolveChangeRequestId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  const isUuid = UUID_REGEX.test(identifier);

  const result = await db
    .select({ id: changeRequests.id })
    .from(changeRequests)
    .where(isUuid ? eq(changeRequests.id, identifier) : eq(changeRequests.legacyId, identifier))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Resolves a WorkSession identifier (UUID or legacy_id) to the canonical database UUID
 */
export async function resolveWorkSessionId(identifier: string): Promise<string | null> {
  if (!identifier) return null;
  const isUuid = UUID_REGEX.test(identifier);

  const result = await db
    .select({ id: workSessions.id })
    .from(workSessions)
    .where(isUuid ? eq(workSessions.id, identifier) : eq(workSessions.legacyId, identifier))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}
