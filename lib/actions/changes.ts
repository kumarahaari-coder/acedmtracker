import { db, runTransaction } from "../db";
import { changeRequests, changeRequestResponses, submissionVersions, contentItems, projects } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveSubmissionVersionId, resolveContentItemId } from "../compat/resolver";

export interface CreateChangeRequestParams {
  actorUserId: string;
  submissionVersionId: string;
  component: "copy" | "creative" | "posting_date";
  requestedChange: string;
  priority?: "low" | "medium" | "high" | "blocker";
}

/**
 * 1. Create Change Request Action
 * Logs revision requirement on a component, advancing deliverable stage to 'changes_requested'.
 */
export async function createChangeRequestAction(params: CreateChangeRequestParams) {
  const { actorUserId, submissionVersionId, component, requestedChange, priority = "medium" } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  if (actor.organizationRole !== "founder" && actor.organizationRole !== "consultant") {
    return { success: false, error: "Unauthorized: Only Founders and Consultants can create change requests." };
  }

  const resolvedVersionId = await resolveSubmissionVersionId(submissionVersionId);
  if (!resolvedVersionId) return { success: false, error: "Submission version not found." };

  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, resolvedVersionId))
    .limit(1);

  if (!version) return { success: false, error: "Submission version not found." };

  if (actor.organizationRole === "consultant") {
    const access = await requireProjectAccess(actor.id, version.projectId);
    if (!access.allowed) {
      return { success: false, error: "Unauthorized: Consultant does not have access to this project." };
    }
  }

  const now = new Date();

  return runTransaction(async (tx) => {
    const [req] = await tx
      .insert(changeRequests)
      .values({
        legacyId: generateLegacyId("cr"),
        projectId: version.projectId,
        orgId: version.orgId,
        contentItemId: version.contentItemId,
        submissionVersionId: version.id,
        component,
        reviewerUserId: actor.id,
        requestedChange,
        priority,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Advance item stage to 'changes_requested'
    const [updatedItem] = await tx
      .update(contentItems)
      .set({ stage: "changes_requested", updatedAt: now })
      .where(eq(contentItems.id, version.contentItemId))
      .returning();

    return { success: true, changeRequest: req, item: updatedItem };
  });
}

/**
 * 2. Respond to Change Request Action (Append-Only Response Thread)
 * Designer provides revision explanation / evidence asset; transitions status to 'addressed'.
 */
export async function respondToChangeRequestAction(params: {
  actorUserId: string;
  changeRequestId: string;
  responseText: string;
  evidenceAssetId?: string;
  addressedInVersionId?: string;
}) {
  const { actorUserId, changeRequestId, responseText, evidenceAssetId, addressedInVersionId } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  const [cr] = await db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.id, changeRequestId))
    .limit(1);

  if (!cr) return { success: false, error: "Change request not found." };

  const now = new Date();

  return runTransaction(async (tx) => {
    // Append to response thread
    const [response] = await tx
      .insert(changeRequestResponses)
      .values({
        changeRequestId: cr.id,
        projectId: cr.projectId,
        orgId: cr.orgId,
        responderUserId: actor.id,
        responseText,
        evidenceAssetId: evidenceAssetId || null,
        addressedInVersionId: addressedInVersionId || null,
        createdAt: now,
      })
      .returning();

    // Transition CR status to 'addressed'
    const [updatedCr] = await tx
      .update(changeRequests)
      .set({ status: "addressed", updatedAt: now })
      .where(eq(changeRequests.id, cr.id))
      .returning();

    return { success: true, changeRequest: updatedCr, response };
  });
}

/**
 * 3. Resolve Change Request Action
 * Reviewer marks request as 'resolved', 'waived', or 'disputed'.
 */
export async function resolveChangeRequestAction(params: {
  actorUserId: string;
  changeRequestId: string;
  newStatus: "resolved" | "waived" | "disputed";
  reason?: string;
}) {
  const { actorUserId, changeRequestId, newStatus, reason } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  if (actor.organizationRole !== "founder" && actor.organizationRole !== "consultant") {
    return { success: false, error: "Unauthorized." };
  }

  const [cr] = await db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.id, changeRequestId))
    .limit(1);

  if (!cr) return { success: false, error: "Change request not found." };

  const now = new Date();
  const [updated] = await db
    .update(changeRequests)
    .set({
      status: newStatus,
      resolutionReason: reason || null,
      resolvedByUserId: actor.id,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(changeRequests.id, cr.id))
    .returning();

  return { success: true, changeRequest: updated };
}
