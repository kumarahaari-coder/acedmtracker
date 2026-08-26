"use server";

import { db, runTransaction } from "../db";
import { approvalDecisions, founderOverrides, submissionVersions, contentItems, projects } from "../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getAuthoritativeUser, requireProjectAccess } from "../auth/session";
import { generateLegacyId, resolveSubmissionVersionId, resolveContentItemId } from "../compat/resolver";

export interface RecordApprovalDecisionParams {
  actorUserId: string;
  submissionVersionId: string;
  component: "copy" | "creative" | "posting_date";
  decision: "pending" | "approved" | "changes_requested" | "approved_with_conditions";
  note?: string;
}

/**
 * 1. Record Approval Decision Action (Append-Only Historical Ledger)
 * Strictly evaluates against the current submission version and its component fingerprint.
 * Advances content item stage according to the dual-signoff matrix.
 */
export async function recordApprovalDecisionAction(params: RecordApprovalDecisionParams) {
  const { actorUserId, submissionVersionId, component, decision, note } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  // Only Founder and Consultant can render approval decisions
  if (actor.organizationRole !== "founder" && actor.organizationRole !== "consultant") {
    return { success: false, error: "Unauthorized: Only Founders and Consultants can render approval decisions." };
  }

  const resolvedVersionId = await resolveSubmissionVersionId(submissionVersionId);
  if (!resolvedVersionId) return { success: false, error: "Submission version not found." };

  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, resolvedVersionId))
    .limit(1);

  if (!version) return { success: false, error: "Submission version not found." };
  if (version.isDraft) {
    return { success: false, error: "Cannot review a draft version. Submission must be formally submitted first." };
  }

  // Consultant must have active project membership
  if (actor.organizationRole === "consultant") {
    const access = await requireProjectAccess(actor.id, version.projectId);
    if (!access.allowed) {
      return { success: false, error: "Unauthorized: Consultant does not have access to this project." };
    }
  }

  const fingerprint =
    component === "copy"
      ? version.copyFingerprint
      : component === "creative"
      ? version.creativeFingerprint
      : version.postingDateFingerprint;

  const now = new Date();

  return runTransaction(async (tx) => {
    // Append decision
    const [newDecision] = await tx
      .insert(approvalDecisions)
      .values({
        legacyId: generateLegacyId("dec"),
        projectId: version.projectId,
        orgId: version.orgId,
        contentItemId: version.contentItemId,
        submissionVersionId: version.id,
        component,
        componentFingerprint: fingerprint,
        reviewerUserId: actor.id,
        reviewerRole: actor.organizationRole as "founder" | "consultant",
        decision,
        note,
        decidedAt: now,
      })
      .returning();

    // Query all active decisions for this version
    const activeDecisions = await tx
      .select()
      .from(approvalDecisions)
      .where(
        and(
          eq(approvalDecisions.submissionVersionId, version.id),
          sql`${approvalDecisions.revokedAt} IS NULL`
        )
      );

    const hasRejectionOrConditions = activeDecisions.some(
      (d) => d.decision === "changes_requested" || d.decision === "approved_with_conditions"
    );

    // Dual-signoff check across copy, creative, and posting_date
    const copyApproved =
      activeDecisions.some((d) => d.component === "copy" && d.reviewerRole === "founder" && d.decision === "approved") &&
      activeDecisions.some((d) => d.component === "copy" && d.reviewerRole === "consultant" && d.decision === "approved");

    const creativeApproved =
      activeDecisions.some((d) => d.component === "creative" && d.reviewerRole === "founder" && d.decision === "approved") &&
      activeDecisions.some((d) => d.component === "creative" && d.reviewerRole === "consultant" && d.decision === "approved");

    const dateApproved =
      activeDecisions.some((d) => d.component === "posting_date" && d.reviewerRole === "founder" && d.decision === "approved") &&
      activeDecisions.some((d) => d.component === "posting_date" && d.reviewerRole === "consultant" && d.decision === "approved");

    let nextStage = "in_review";
    if (hasRejectionOrConditions) {
      nextStage = "changes_requested";
    } else if (copyApproved && creativeApproved && dateApproved) {
      nextStage = "approved";
    }

    const [updatedItem] = await tx
      .update(contentItems)
      .set({ stage: nextStage as any, updatedAt: now })
      .where(eq(contentItems.id, version.contentItemId))
      .returning();

    return { success: true, decision: newDecision, item: updatedItem, stage: nextStage };
  });
}

/**
 * 2. Revoke Approval Decision Action
 * Historical revocation event: preserves record, sets revokedAt and revocationReason.
 */
export async function revokeApprovalDecisionAction(params: {
  actorUserId: string;
  decisionId: string;
  reason: string;
}) {
  const { actorUserId, decisionId, reason } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor) return { success: false, error: "Unauthorized." };

  if (actor.organizationRole !== "founder" && actor.organizationRole !== "consultant") {
    return { success: false, error: "Unauthorized." };
  }

  const [decision] = await db
    .select()
    .from(approvalDecisions)
    .where(eq(approvalDecisions.id, decisionId))
    .limit(1);

  if (!decision) return { success: false, error: "Decision not found." };

  const now = new Date();

  return runTransaction(async (tx) => {
    const [revoked] = await tx
      .update(approvalDecisions)
      .set({
        revokedAt: now,
        revocationReason: reason,
        revokedByUserId: actor.id,
      })
      .where(eq(approvalDecisions.id, decision.id))
      .returning();

    // Revert content item stage to 'in_review'
    const [updatedItem] = await tx
      .update(contentItems)
      .set({ stage: "in_review", updatedAt: now })
      .where(eq(contentItems.id, decision.contentItemId))
      .returning();

    return { success: true, decision: revoked, item: updatedItem };
  });
}

/**
 * 3. Founder Override Action
 * Founder-only emergency bypass advancing stage to 'approved'.
 */
export async function recordFounderOverrideAction(params: {
  actorUserId: string;
  submissionVersionId: string;
  component?: "copy" | "creative" | "posting_date";
  reason: string;
}) {
  const { actorUserId, submissionVersionId, component, reason } = params;

  const actor = await getAuthoritativeUser(actorUserId);
  if (!actor || actor.organizationRole !== "founder") {
    return { success: false, error: "Unauthorized: Strictly restricted to Founder role." };
  }

  const resolvedVersionId = await resolveSubmissionVersionId(submissionVersionId);
  if (!resolvedVersionId) return { success: false, error: "Submission version not found." };

  const [version] = await db
    .select()
    .from(submissionVersions)
    .where(eq(submissionVersions.id, resolvedVersionId))
    .limit(1);

  if (!version) return { success: false, error: "Submission version not found." };

  const now = new Date();

  return runTransaction(async (tx) => {
    const [override] = await tx
      .insert(founderOverrides)
      .values({
        legacyId: generateLegacyId("ovr"),
        projectId: version.projectId,
        orgId: version.orgId,
        contentItemId: version.contentItemId,
        submissionVersionId: version.id,
        component,
        reason,
        actorUserId: actor.id,
        createdAt: now,
      })
      .returning();

    const [updatedItem] = await tx
      .update(contentItems)
      .set({ stage: "approved", updatedAt: now })
      .where(eq(contentItems.id, version.contentItemId))
      .returning();

    return { success: true, override, item: updatedItem };
  });
}
