"use server";

import { db, runTransaction } from "../db";
import {
  contentGroups,
  contentItems,
  submissionVersions,
  contentAssignments,
  assignmentDeadlineHistory,
  auditRecords,
  projects,
  projectMemberships,
  users,
} from "../db/schema";
import { workSessions } from "../db/schema/work-sessions";
import { creativeAssets, submissionAssets } from "../db/schema/assets";
import { approvalDecisions, changeRequests } from "../db/schema/approvals";
import { comments, externalReviewTokens } from "../db/schema/collaboration";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getAuthoritativeUser } from "../auth/session";
import { resolveContentItemId } from "../compat/resolver";
import { invalidateWorkspaceEntities } from "./revalidation";
import { invalidateCachedEffortStandards } from "../cache/effortStandardsCache";
import { deleteR2Object } from "../storage/r2";

export interface DeleteDeliverableParams {
  actorUserId?: string;
  contentItemId: string;
  deleteEntireGroup?: boolean;
  reason?: string;
}

export interface DeleteDeliverableResult {
  success: boolean;
  deletionType?: "hard_delete" | "soft_delete";
  deletedItemIds?: string[];
  deletedGroupId?: string;
  anchorTransferredToId?: string;
  error?: string;
}

/**
 * Inspects a deliverable to determine whether it has meaningful operational history.
 *
 * Operational History Definition:
 * - Stage is NOT 'idea' or 'draft' (e.g. submitted, in_review, changes_requested, approved, scheduled, published)
 * - Published or Completed timestamps are set
 * - Formally submitted submission version (isDraft === false or submittedAt != null)
 * - Work session with logged time (accumulatedSeconds > 0 or active segment)
 * - Formal approval decision linked to any version
 * - Change request linked to any version
 * - Discussion comments linked to item
 * - Client / external guest review interactions (viewedAt or decision present)
 */
async function checkItemOperationalHistory(tx: any, itemId: string, targetItem: any): Promise<{
  hasHistory: boolean;
  reasons: string[];
}> {
  const reasons: string[] = [];

  // 1. Stage / Completed / Published
  if (targetItem.stage && !["idea", "draft"].includes(targetItem.stage)) {
    reasons.push(`Stage is '${targetItem.stage}'`);
  }
  if (targetItem.publishedAt || targetItem.completedAt) {
    reasons.push("Item has published or completed timestamp");
  }

  // 2. Submission versions (any non-draft or formal submission)
  const versions = await tx
    .select({
      id: submissionVersions.id,
      isDraft: submissionVersions.isDraft,
      submittedAt: submissionVersions.submittedAt,
    })
    .from(submissionVersions)
    .where(eq(submissionVersions.contentItemId, itemId));

  const submittedVersion = versions.find(
    (v: any) => v.isDraft === false || v.submittedAt !== null
  );
  if (submittedVersion) {
    reasons.push("Item has formally submitted versions");
  }

  // 3. Work sessions with accumulated seconds
  const sessions = await tx
    .select({
      id: workSessions.id,
      accumulatedSeconds: workSessions.accumulatedSeconds,
      activeSegmentStartedAt: workSessions.activeSegmentStartedAt,
    })
    .from(workSessions)
    .where(eq(workSessions.contentItemId, itemId));

  const loggedSession = sessions.find(
    (s: any) => (s.accumulatedSeconds || 0) > 0 || s.activeSegmentStartedAt !== null
  );
  if (loggedSession) {
    reasons.push("Item has logged work sessions with recorded time");
  }

  // 4. Approval decisions and change requests
  const versionIds = versions.map((v: any) => v.id);
  if (versionIds.length > 0) {
    const decisions = await tx
      .select({ id: approvalDecisions.id })
      .from(approvalDecisions)
      .where(inArray(approvalDecisions.submissionVersionId, versionIds))
      .limit(1);
    if (decisions.length > 0) {
      reasons.push("Item has formal approval decisions");
    }

    const crs = await tx
      .select({ id: changeRequests.id })
      .from(changeRequests)
      .where(inArray(changeRequests.submissionVersionId, versionIds))
      .limit(1);
    if (crs.length > 0) {
      reasons.push("Item has change requests");
    }
  }

  // 5. Discussion comments
  const itemComments = await tx
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.contentItemId, itemId))
    .limit(1);
  if (itemComments.length > 0) {
    reasons.push("Item has discussion comments");
  }

  // 6. External review tokens generated
  const tokens = await tx
    .select({
      id: externalReviewTokens.id,
    })
    .from(externalReviewTokens)
    .where(eq(externalReviewTokens.contentItemId, itemId))
    .limit(1);
  if (tokens.length > 0) {
    reasons.push("Item has external review links generated");
  }

  return {
    hasHistory: reasons.length > 0,
    reasons,
  };
}

/**
 * Authoritative PostgreSQL-first Delete Deliverable Action
 * Supports:
 * - Role-based authorization (Founder, Admin, Project-assigned Consultant)
 * - Two deletion lifecycles: Hard-Delete (no history) vs Soft-Delete / Archive (history exists)
 * - Multi-platform ContentGroup deletion vs Single-platform deletion with Effort Anchor Transfer
 * - Transactional cleanup of dependent draft records & orphaned R2 assets
 * - Comprehensive audit logging
 */
export async function deleteDeliverableAction(
  params: DeleteDeliverableParams
): Promise<DeleteDeliverableResult> {
  const { actorUserId, contentItemId, deleteEntireGroup = false, reason = "User requested deletion" } = params;

  try {
    // 1. Authoritative User & Role Authorization
    const authUser = await getAuthoritativeUser(actorUserId);
    if (!authUser) {
      return { success: false, error: "Unauthorized: Invalid user session." };
    }

    const resolvedItemId = await resolveContentItemId(contentItemId);
    if (!resolvedItemId) {
      return { success: false, error: "Deliverable not found." };
    }

    // 2. Fetch target item
    const [targetItem] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.id, resolvedItemId), eq(contentItems.orgId, authUser.orgId)))
      .limit(1);

    if (!targetItem || targetItem.deletedAt !== null) {
      return { success: false, error: "Deliverable not found or already deleted." };
    }

    // 3. Server-side Permission Enforcement:
    // Allowed: Founder, Admin, Consultant assigned to this project
    // Denied: Designers, Video Editors, Collaborators, Clients, External Reviewers
    const orgRole = authUser.organizationRole;
    if (orgRole === "client") {
      return { success: false, error: "Forbidden: Clients cannot delete deliverables." };
    }

    if (orgRole === "founder" || orgRole === "admin") {
      // Management roles permitted
    } else if (orgRole === "consultant") {
      // Consultant must have active project membership
      const [membership] = await db
        .select()
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.projectId, targetItem.projectId),
            eq(projectMemberships.userId, authUser.id),
            eq(projectMemberships.status, "active")
          )
        )
        .limit(1);

      if (!membership) {
        return {
          success: false,
          error: "Forbidden: Consultants may only delete deliverables in projects they are assigned to.",
        };
      }
    } else {
      // Designer, video_editor, collaborator, etc.
      return {
        success: false,
        error: "Forbidden: Designers and team contributors do not have permission to delete deliverables.",
      };
    }

    // 4. Determine items to delete
    let itemsToDelete: any[] = [targetItem];
    if (deleteEntireGroup && targetItem.contentGroupId) {
      const groupItems = await db
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.contentGroupId, targetItem.contentGroupId),
            eq(contentItems.orgId, authUser.orgId),
            sql`${contentItems.deletedAt} IS NULL`
          )
        );
      if (groupItems.length > 0) {
        itemsToDelete = groupItems;
      }
    }

    // Execute PostgreSQL Transaction
    const txResult = await runTransaction(async (tx) => {
      // Check operational history across all target items
      const historyChecks = await Promise.all(
        itemsToDelete.map((it) => checkItemOperationalHistory(tx, it.id, it))
      );

      const anyHasHistory = historyChecks.some((h) => h.hasHistory);
      const isHardDelete = !anyHasHistory;
      const orphanR2KeysToDelete: string[] = [];
      let anchorTransferredToId: string | undefined;

      // --- ContentGroup Effort Anchor Transfer Logic (Single Item Deletion) ---
      if (!deleteEntireGroup && targetItem.contentGroupId) {
        const survivingSiblings = await tx
          .select()
          .from(contentItems)
          .where(
            and(
              eq(contentItems.contentGroupId, targetItem.contentGroupId),
              sql`${contentItems.id} != ${targetItem.id}`,
              sql`${contentItems.deletedAt} IS NULL`
            )
          )
          .orderBy(contentItems.createdAt);

        if (targetItem.isEffortAnchor && survivingSiblings.length > 0) {
          // Check if any other surviving sibling already has anchor
          const existingOtherAnchor = survivingSiblings.find((s: any) => s.isEffortAnchor);
          if (!existingOtherAnchor) {
            const newAnchor = survivingSiblings[0];
            anchorTransferredToId = newAnchor.id;

            // Atomically transfer anchor and planned effort snapshot to surviving sibling
            await tx
              .update(contentItems)
              .set({
                isEffortAnchor: true,
                finalPlannedSeconds: targetItem.finalPlannedSeconds || newAnchor.finalPlannedSeconds,
                standardContentSeconds: targetItem.standardContentSeconds || newAnchor.standardContentSeconds,
                standardProductionSeconds: targetItem.standardProductionSeconds || newAnchor.standardProductionSeconds,
                revisionContentSeconds: targetItem.revisionContentSeconds || newAnchor.revisionContentSeconds,
                revisionProductionSeconds: targetItem.revisionProductionSeconds || newAnchor.revisionProductionSeconds,
                updatedAt: sql`NOW()`,
              })
              .where(eq(contentItems.id, newAnchor.id));
          }
        }
      }

      const deletedItemIds = itemsToDelete.map((it) => it.id);

      if (isHardDelete) {
        // --- BEHAVIOR A: Hard Delete (Permanent Removal of Drafts Without History) ---
        for (const item of itemsToDelete) {
          // 1. Gather all submission versions
          const versions = await tx
            .select({ id: submissionVersions.id })
            .from(submissionVersions)
            .where(eq(submissionVersions.contentItemId, item.id));
          const versionIds = versions.map((v: any) => v.id);

          if (versionIds.length > 0) {
            // 2. Gather submission assets
            const subAssets = await tx
              .select()
              .from(submissionAssets)
              .where(inArray(submissionAssets.submissionVersionId, versionIds));
            const assetIds = subAssets.map((sa: any) => sa.creativeAssetId);

            // 3. Delete submission_assets join records
            await tx
              .delete(submissionAssets)
              .where(inArray(submissionAssets.submissionVersionId, versionIds));

            // 4. For each creative asset, verify if orphaned
            for (const aId of assetIds) {
              const otherRefs = await tx
                .select({ id: submissionAssets.id })
                .from(submissionAssets)
                .where(eq(submissionAssets.creativeAssetId, aId))
                .limit(1);

              const [cAsset] = await tx
                .select()
                .from(creativeAssets)
                .where(eq(creativeAssets.id, aId))
                .limit(1);

              if (otherRefs.length === 0 && cAsset) {
                await tx.delete(creativeAssets).where(eq(creativeAssets.id, aId));
                if (cAsset.r2ObjectKey) {
                  orphanR2KeysToDelete.push(cAsset.r2ObjectKey);
                }
              }
            }

            // 5. Delete submission versions
            await tx.delete(submissionVersions).where(inArray(submissionVersions.id, versionIds));
          }

          // 6. Delete assignments and assignment deadline history
          const assignments = await tx
            .select({ id: contentAssignments.id })
            .from(contentAssignments)
            .where(eq(contentAssignments.contentItemId, item.id));
          const asgnIds = assignments.map((a: any) => a.id);

          if (asgnIds.length > 0) {
            await tx
              .delete(assignmentDeadlineHistory)
              .where(inArray(assignmentDeadlineHistory.assignmentId, asgnIds));
            await tx
              .delete(contentAssignments)
              .where(inArray(contentAssignments.id, asgnIds));
          }

          // 7. Delete empty / 0s work sessions
          await tx.delete(workSessions).where(eq(workSessions.contentItemId, item.id));

          // 8. Delete unviewed external review tokens
          await tx.delete(externalReviewTokens).where(eq(externalReviewTokens.contentItemId, item.id));

          // 9. Delete content item record
          await tx.delete(contentItems).where(eq(contentItems.id, item.id));
        }

        // If entire group deleted and hard-delete eligible, clean group record
        if (deleteEntireGroup && targetItem.contentGroupId) {
          await tx.delete(contentGroups).where(eq(contentGroups.id, targetItem.contentGroupId));
        }
      } else {
        // --- BEHAVIOR B: Soft Delete (Archive / Retain Historical Evidence) ---
        const now = new Date();
        for (const item of itemsToDelete) {
          await tx
            .update(contentItems)
            .set({
              status: "archived",
              deletedAt: now,
              deletedByUserId: authUser.id,
              deletionReason: reason,
              updatedAt: now,
            })
            .where(eq(contentItems.id, item.id));

          // Cancel active assignments
          await tx
            .update(contentAssignments)
            .set({
              status: "reassigned",
              reassignmentReason: `Deliverable archived: ${reason}`,
              updatedAt: now,
            })
            .where(
              and(
                eq(contentAssignments.contentItemId, item.id),
                inArray(contentAssignments.status, ["assigned", "accepted", "in_progress"])
              )
            );

          // Stop active timers if any
          await tx
            .update(workSessions)
            .set({
              status: "completed",
              endedAt: now,
              notes: sql`CONCAT(COALESCE(notes, ''), ' [Closed on deliverable deletion]')`,
              updatedAt: now,
            })
            .where(
              and(
                eq(workSessions.contentItemId, item.id),
                eq(workSessions.status, "active")
              )
            );
        }

        if (deleteEntireGroup && targetItem.contentGroupId) {
          await tx
            .update(contentGroups)
            .set({
              deletedAt: now,
              deletedByUserId: authUser.id,
              deletionReason: reason,
              updatedAt: now,
            })
            .where(eq(contentGroups.id, targetItem.contentGroupId));
        }
      }

      // --- 8. Audit Record ---
      await tx.insert(auditRecords).values({
        projectId: targetItem.projectId,
        orgId: targetItem.orgId,
        actorUserId: authUser.id,
        actorName: authUser.fullName || authUser.email,
        actorRole: authUser.organizationRole,
        action: deleteEntireGroup
          ? (isHardDelete ? "HARD_DELETE_CONTENT_GROUP" : "SOFT_DELETE_CONTENT_GROUP")
          : (isHardDelete ? "HARD_DELETE_DELIVERABLE" : "SOFT_DELETE_DELIVERABLE"),
        entityType: deleteEntireGroup ? "content_group" : "content_item",
        entityId: deleteEntireGroup ? (targetItem.contentGroupId || targetItem.id) : targetItem.id,
        reason,
        summary: deleteEntireGroup
          ? `${isHardDelete ? "Hard-deleted" : "Soft-deleted"} content group and ${deletedItemIds.length} deliverables: ${itemsToDelete.map((i) => i.title).join(", ")}`
          : `${isHardDelete ? "Hard-deleted" : "Soft-deleted"} deliverable '${targetItem.title}' (${targetItem.platform})${anchorTransferredToId ? ` [Effort anchor transferred to ${anchorTransferredToId}]` : ""}`,
        beforeState: {
          itemTitles: itemsToDelete.map((i) => i.title),
          platforms: itemsToDelete.map((i) => i.platform),
          stages: itemsToDelete.map((i) => i.stage),
          contentGroupId: targetItem.contentGroupId,
          isEffortAnchor: targetItem.isEffortAnchor,
          finalPlannedSeconds: targetItem.finalPlannedSeconds,
        },
        afterState: {
          deletedItemIds,
          deletionType: isHardDelete ? "hard_delete" : "soft_delete",
          anchorTransferredToId,
        },
      });

      return {
        isHardDelete,
        deletedItemIds,
        deletedGroupId: deleteEntireGroup ? targetItem.contentGroupId || undefined : undefined,
        anchorTransferredToId,
        orphanR2KeysToDelete,
      };
    });

    // --- 9. Post-Commit Cleanup of Orphaned R2 Assets ---
    if (txResult.orphanR2KeysToDelete.length > 0) {
      for (const key of txResult.orphanR2KeysToDelete) {
        try {
          await deleteR2Object(key);
        } catch (r2Err) {
          console.error(`[deleteDeliverableAction] Non-fatal error cleaning R2 object ${key}:`, r2Err);
        }
      }
    }

    // Invalidate effort standards cache if effort anchor moved
    if (txResult.anchorTransferredToId) {
      invalidateCachedEffortStandards(targetItem.orgId);
    }

    // Revalidate affected routes
    await invalidateWorkspaceEntities({
      projectId: targetItem.projectId,
      userId: authUser.id,
      orgId: targetItem.orgId,
    });

    return {
      success: true,
      deletionType: txResult.isHardDelete ? "hard_delete" : "soft_delete",
      deletedItemIds: txResult.deletedItemIds,
      deletedGroupId: txResult.deletedGroupId,
      anchorTransferredToId: txResult.anchorTransferredToId,
    };
  } catch (err: any) {
    console.error("[deleteDeliverableAction] Error executing deliverable deletion:", err);
    return {
      success: false,
      error: err.message || "An unexpected error occurred while deleting the deliverable.",
    };
  }
}
