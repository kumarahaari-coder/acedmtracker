import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../lib/db";
import {
  contentItems,
  contentGroups,
  submissionVersions,
  contentAssignments,
  projects,
  projectMemberships,
  users,
  creativeAssets,
  submissionAssets,
  changeRequests,
  approvalDecisions,
} from "../../lib/db/schema";
import {
  resolveSubmissionEligibility,
  getSubmissionEligibilityAction,
  submitVersionAction,
  createNewVersionDraftAction,
  syncContentGroupFieldsAction,
} from "../../lib/actions/content";
import {
  createChangeRequestAction,
  respondToChangeRequestAction,
} from "../../lib/actions/changes";
import {
  recordApprovalDecisionAction,
  recordFounderOverrideAction,
} from "../../lib/actions/approvals";
import { eq, and, isNull, desc } from "drizzle-orm";
import { enforceTestSafetyGuard } from "../helpers/safetyGuard";

describe("Authoritative Deliverable Submission & Approval Workflow Invariants", () => {
  let founderUser: any;
  let designerUser: any;
  let clientUser: any;
  let testProject: any;

  beforeAll(async () => {
    enforceTestSafetyGuard();

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    founderUser = activeUsers.find((u) => u.organizationRole === "founder") || activeUsers[0];
    designerUser = activeUsers.find((u) => u.organizationRole === "designer" || u.organizationRole === "consultant") || activeUsers[1];
    clientUser = activeUsers.find((u) => u.organizationRole === "client");

    const [proj] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, founderUser.orgId), isNull(projects.deletedAt)))
      .limit(1);

    testProject = proj;

    // Ensure designer has project membership
    if (designerUser) {
      const existingMembership = await db
        .select()
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.projectId, testProject.id),
            eq(projectMemberships.userId, designerUser.id)
          )
        )
        .limit(1);

      if (existingMembership.length === 0) {
        await db.insert(projectMemberships).values({
          projectId: testProject.id,
          orgId: founderUser.orgId,
          userId: designerUser.id,
          membershipRole: "designer",
          status: "active",
        });
      }
    }
  });

  it("1. External Drive Asset: status='ready', fileSizeBytes=0, octet-stream IS eligible", async () => {
    // Create test item in draft
    const [item] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        legacyId: `test_ext_${Date.now()}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        title: `Drive Asset Test Item (${Date.now()})`,
        platform: "LinkedIn",
        contentType: "post",
        stage: "draft",
        currentVersionNumber: 1,
      })
      .returning();

    // Create draft version (empty caption, no scheduled date)
    const [ver] = await db
      .insert(submissionVersions)
      .values({
        id: crypto.randomUUID(),
        legacyId: `ver_ext_${Date.now()}`,
        contentItemId: item.id,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        versionNumber: 1,
        isDraft: true,
        caption: "",
        hashtags: [],
        cta: "",
        copyFingerprint: "fp_copy_test",
        creativeFingerprint: "fp_creative_test",
        postingDateFingerprint: "fp_date_test",
        createdByUserId: founderUser.id,
      })
      .returning();

    // Create external Google Drive creative asset matching production fe2741e3-3b52-45ba-86aa-483a2246c34b
    const [ca] = await db
      .insert(creativeAssets)
      .values({
        id: crypto.randomUUID(),
        projectId: testProject.id,
        orgId: founderUser.orgId,
        isDriveLink: true,
        driveUrl: "https://drive.google.com/file/d/126jpEAzcUPobQxujr3wwPE1O3TagUiwz/view?usp=drive_link",
        r2ObjectKey: `external/drive_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`,
        originalFilename: "Google Drive Asset Package",
        fileSizeBytes: 0,
        mimeType: "application/octet-stream",
        contentHash: "hash_drive_" + Math.random().toString(36),
        uploadedByUserId: founderUser.id,
        status: "ready",
      })
      .returning();

    // Link asset to submission version
    await db.insert(submissionAssets).values({
      submissionVersionId: ver.id,
      creativeAssetId: ca.id,
    });

    // Check canonical resolver
    const eligibility = await resolveSubmissionEligibility(db, item.id, founderUser.id);
    expect(eligibility.success).toBe(true);
    expect(eligibility.data!.eligible).toBe(true);
    expect(eligibility.data!.hasCreativeAsset).toBe(true);
    expect(eligibility.data!.hasCopy).toBe(false); // Optional, does not block
    expect(eligibility.data!.hasPostingDate).toBe(false); // Optional, does not block
    expect(eligibility.data!.blockers.length).toBe(0);

    // Verify public getSubmissionEligibilityAction produces the exact same result
    const publicActionRes = await getSubmissionEligibilityAction({
      contentItemId: item.id,
      actorUserId: founderUser.id,
    });
    expect(publicActionRes.success).toBe(true);
    expect(publicActionRes.data!.eligible).toBe(true);
  });

  it("2. Missing creative work returns eligible=false with canonical blocker", async () => {
    const [item] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        legacyId: `test_no_asset_${Date.now()}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        title: `No Asset Test Item (${Date.now()})`,
        platform: "Instagram",
        contentType: "post",
        stage: "draft",
        currentVersionNumber: 1,
      })
      .returning();

    const [ver] = await db
      .insert(submissionVersions)
      .values({
        id: crypto.randomUUID(),
        legacyId: `ver_no_asset_${Date.now()}`,
        contentItemId: item.id,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        versionNumber: 1,
        isDraft: true,
        caption: "Great copy",
        hashtags: [],
        cta: "",
        copyFingerprint: "fp_copy_test",
        creativeFingerprint: "fp_creative_test",
        postingDateFingerprint: "fp_date_test",
        createdByUserId: founderUser.id,
      })
      .returning();

    const eligibility = await resolveSubmissionEligibility(db, item.id, founderUser.id);
    expect(eligibility.data!.eligible).toBe(false);
    expect(eligibility.data!.hasCreativeAsset).toBe(false);
    expect(eligibility.data!.blockers).toContain("Creative work must be attached before submitting for review.");

    // Direct mutation attempt also fails with the same error
    const submitRes = await submitVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: ver.id,
    });
    expect(submitRes.success).toBe(false);
    expect(submitRes.error).toContain("Creative work must be attached before submitting for review.");
  });

  it("3. Work ownership invariant: content_assignments.status is NOT changed to 'submitted'", async () => {
    const [item] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        legacyId: `test_assign_${Date.now()}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        title: `Assignment Invariant Test (${Date.now()})`,
        platform: "Instagram",
        contentType: "post",
        stage: "draft",
        currentVersionNumber: 1,
      })
      .returning();

    const [ver] = await db
      .insert(submissionVersions)
      .values({
        id: crypto.randomUUID(),
        legacyId: `ver_assign_${Date.now()}`,
        contentItemId: item.id,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        versionNumber: 1,
        isDraft: true,
        caption: "",
        hashtags: [],
        cta: "",
        copyFingerprint: "fp_copy_test",
        creativeFingerprint: "fp_creative_test",
        postingDateFingerprint: "fp_date_test",
        createdByUserId: founderUser.id,
      })
      .returning();

    // Attach valid creative
    const [ca] = await db
      .insert(creativeAssets)
      .values({
        id: crypto.randomUUID(),
        projectId: testProject.id,
        orgId: founderUser.orgId,
        r2ObjectKey: `test/ca_${Date.now()}`,
        originalFilename: "art.png",
        fileSizeBytes: 1024,
        mimeType: "image/png",
        contentHash: "hash_" + Math.random().toString(36),
        uploadedByUserId: designerUser.id,
        status: "ready",
      })
      .returning();

    await db.insert(submissionAssets).values({
      submissionVersionId: ver.id,
      creativeAssetId: ca.id,
    });

    // Create an assignment in 'in_progress'
    const [assignment] = await db
      .insert(contentAssignments)
      .values({
        id: crypto.randomUUID(),
        legacyId: `asg_${Date.now()}`,
        contentItemId: item.id,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        assigneeUserId: designerUser.id,
        assignedByUserId: founderUser.id,
        role: "designer",
        status: "in_progress",
        initialDueAt: new Date(),
        currentDueAt: new Date(),
      })
      .returning();

    // Designer submits the deliverable
    const submitRes = await submitVersionAction({
      actorUserId: designerUser.id,
      submissionVersionId: ver.id,
    });
    expect(submitRes.success).toBe(true);

    // Verify content_items stage updated to in_review
    const [updatedItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    expect(updatedItem.stage).toBe("in_review");

    // Verify version is frozen
    const [updatedVer] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, ver.id));
    expect(updatedVer.isDraft).toBe(false);
    expect(updatedVer.submittedAt).not.toBeNull();

    // CRITICAL: Assignment status remains 'in_progress', firstSubmittedAt is stamped
    const [updatedAssignment] = await db.select().from(contentAssignments).where(eq(contentAssignments.id, assignment.id));
    expect(updatedAssignment.status).toBe("in_progress"); // NOT 'submitted'
    expect(updatedAssignment.firstSubmittedAt).not.toBeNull();
  });

  it("4. Full Changes Requested & Revision Lifecycle: V1 immutable, V2 inherits creative, Reviewer approves", async () => {
    // 1. Create deliverable
    const [item] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        legacyId: `test_rev_${Date.now()}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        title: `Full Revision Lifecycle Test (${Date.now()})`,
        platform: "LinkedIn",
        contentType: "post",
        stage: "draft",
        currentVersionNumber: 1,
      })
      .returning();

    // 2. Draft V1
    const [v1] = await db
      .insert(submissionVersions)
      .values({
        id: crypto.randomUUID(),
        legacyId: `ver_v1_${Date.now()}`,
        contentItemId: item.id,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        versionNumber: 1,
        isDraft: true,
        caption: "Original V1 Copy",
        hashtags: [],
        cta: "",
        copyFingerprint: "fp_v1_copy",
        creativeFingerprint: "fp_v1_creative",
        postingDateFingerprint: "fp_v1_date",
        createdByUserId: founderUser.id,
      })
      .returning();

    // Attach Drive creative
    const [creative] = await db
      .insert(creativeAssets)
      .values({
        id: crypto.randomUUID(),
        projectId: testProject.id,
        orgId: founderUser.orgId,
        isDriveLink: true,
        driveUrl: "https://drive.google.com/file/d/test_lifecycle/view",
        r2ObjectKey: `external/drive_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`,
        originalFilename: "Design Package.zip",
        fileSizeBytes: 0,
        mimeType: "application/octet-stream",
        contentHash: "hash_lc_" + Math.random().toString(36),
        uploadedByUserId: founderUser.id,
        status: "ready",
      })
      .returning();

    await db.insert(submissionAssets).values({
      submissionVersionId: v1.id,
      creativeAssetId: creative.id,
    });

    // 3. Submit V1 for review
    const submitV1Res = await submitVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: v1.id,
    });
    expect(submitV1Res.success).toBe(true);

    const [v1Frozen] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, v1.id));
    expect(v1Frozen.isDraft).toBe(false);
    expect(v1Frozen.submittedAt).not.toBeNull();

    // 4. Reviewer requests changes
    const crRes = await createChangeRequestAction({
      actorUserId: founderUser.id,
      contentItemId: item.id,
      submissionVersionId: v1.id,
      component: "creative",
      requestedChange: "Adjust logo sizing and brightness",
      priority: "high",
    });
    expect(crRes.success).toBe(true);

    const [itemChangesReq] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    expect(itemChangesReq.stage).toBe("changes_requested");

    // 5. Create V2 draft
    const v2DraftRes = await createNewVersionDraftAction({
      actorUserId: founderUser.id,
      contentItemId: item.id,
      baseVersionId: v1.id,
    });
    expect(v2DraftRes.success).toBe(true);
    const v2 = (v2DraftRes as any).version;
    expect(v2.versionNumber).toBe(2);
    expect(v2.isDraft).toBe(true);

    // V1 must remain frozen and immutable
    const [v1StillFrozen] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, v1.id));
    expect(v1StillFrozen.isDraft).toBe(false);
    expect(v1StillFrozen.submittedAt?.toISOString()).toBe(v1Frozen.submittedAt?.toISOString());

    // V2 must have inherited the submission_assets linkage to the same creative asset
    const v2Assets = await db
      .select()
      .from(submissionAssets)
      .where(eq(submissionAssets.submissionVersionId, v2.id));
    expect(v2Assets.length).toBe(1);
    expect(v2Assets[0].creativeAssetId).toBe(creative.id);

    // Designer responds to change request
    const respondRes = await respondToChangeRequestAction({
      actorUserId: founderUser.id,
      changeRequestId: (crRes as any).changeRequest.id,
      responseText: "Updated logo proportions per request",
      addressedInVersionId: v2.id,
    });
    expect(respondRes.success).toBe(true);

    // 6. Submit V2
    const submitV2Res = await submitVersionAction({
      actorUserId: founderUser.id,
      submissionVersionId: v2.id,
    });
    expect(submitV2Res.success).toBe(true);

    const [itemInReview] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    expect(itemInReview.stage).toBe("in_review");

    // 7. Reviewer approves all components
    const approveCreative = await recordApprovalDecisionAction({
      actorUserId: founderUser.id,
      contentItemId: item.id,
      submissionVersionId: v2.id,
      component: "creative",
      decision: "approved",
      note: "Looks fantastic!",
    });
    expect(approveCreative.success).toBe(true);

    const approveCopy = await recordApprovalDecisionAction({
      actorUserId: founderUser.id,
      contentItemId: item.id,
      submissionVersionId: v2.id,
      component: "copy",
      decision: "approved",
    });
    expect(approveCopy.success).toBe(true);

    const approveDate = await recordApprovalDecisionAction({
      actorUserId: founderUser.id,
      contentItemId: item.id,
      submissionVersionId: v2.id,
      component: "posting_date",
      decision: "approved",
    });
    expect(approveDate.success).toBe(true);

    // Apply founder override to complete dual-key signoff
    const overrideRes = await recordFounderOverrideAction({
      actorUserId: founderUser.id,
      contentItemId: item.id,
      submissionVersionId: v2.id,
      reason: "Final executive approval completed",
    });
    expect(overrideRes.success).toBe(true);

    // Verify final stage is approved
    const [finalItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    expect(finalItem.stage).toBe("approved");
  }, 15000);

  it("5. PostgreSQL-authoritative Multi-Platform Sync: Shares creative linkage across siblings without duplicating creative asset", async () => {
    // 1. Create content group
    const [group] = await db
      .insert(contentGroups)
      .values({
        id: crypto.randomUUID(),
        legacyId: `grp_${Date.now()}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        title: `Multi-Platform Campaign (${Date.now()})`,
        description: "Fintech 2026",
        createdByUserId: founderUser.id,
      })
      .returning();

    // 2. Create LinkedIn source item with Drive creative
    const [sourceItem] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        legacyId: `src_${Date.now()}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        contentGroupId: group.id,
        title: "Fintech Announcement (LinkedIn)",
        platform: "LinkedIn",
        contentType: "post",
        stage: "draft",
        currentVersionNumber: 1,
      })
      .returning();

    const [sourceVer] = await db
      .insert(submissionVersions)
      .values({
        id: crypto.randomUUID(),
        legacyId: `ver_src_${Date.now()}`,
        contentItemId: sourceItem.id,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        versionNumber: 1,
        isDraft: true,
        caption: "LinkedIn Source Copy",
        hashtags: ["fintech"],
        cta: "Read more",
        copyFingerprint: "fp_src_copy",
        creativeFingerprint: "fp_src_creative",
        postingDateFingerprint: "fp_src_date",
        createdByUserId: founderUser.id,
      })
      .returning();

    const [sharedCreative] = await db
      .insert(creativeAssets)
      .values({
        id: crypto.randomUUID(),
        projectId: testProject.id,
        orgId: founderUser.orgId,
        isDriveLink: true,
        driveUrl: "https://drive.google.com/file/d/shared_campaign_asset/view",
        r2ObjectKey: `external/drive_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`,
        originalFilename: "Shared_Banner.png",
        fileSizeBytes: 0,
        mimeType: "application/octet-stream",
        contentHash: "hash_shared_" + Math.random().toString(36),
        uploadedByUserId: founderUser.id,
        status: "ready",
      })
      .returning();

    await db.insert(submissionAssets).values({
      submissionVersionId: sourceVer.id,
      creativeAssetId: sharedCreative.id,
    });

    // 3. Create Facebook sibling item in draft (no assets yet)
    const [targetItem] = await db
      .insert(contentItems)
      .values({
        id: crypto.randomUUID(),
        legacyId: `tgt_${Date.now()}`,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        contentGroupId: group.id,
        title: "Fintech Announcement (Facebook)",
        platform: "Facebook",
        contentType: "post",
        stage: "draft",
        currentVersionNumber: 1,
      })
      .returning();

    const [targetVer] = await db
      .insert(submissionVersions)
      .values({
        id: crypto.randomUUID(),
        legacyId: `ver_tgt_${Date.now()}`,
        contentItemId: targetItem.id,
        projectId: testProject.id,
        orgId: founderUser.orgId,
        versionNumber: 1,
        isDraft: true,
        caption: "",
        hashtags: [],
        cta: "",
        copyFingerprint: "fp_tgt_copy",
        creativeFingerprint: "fp_tgt_creative",
        postingDateFingerprint: "fp_tgt_date",
        createdByUserId: founderUser.id,
      })
      .returning();

    // 4. Run authoritative sync action
    const syncRes = await syncContentGroupFieldsAction({
      contentGroupId: group.id,
      sourceItemId: sourceItem.id,
      targetItemIds: [targetItem.id],
      syncCreative: true,
      syncCopy: true,
      actorUserId: founderUser.id,
    });
    expect(syncRes.success).toBe(true);

    // 5. Verify targetVer now links to sharedCreative.id via submission_assets
    const targetAssets = await db
      .select()
      .from(submissionAssets)
      .where(eq(submissionAssets.submissionVersionId, targetVer.id));

    expect(targetAssets.length).toBe(1);
    expect(targetAssets[0].creativeAssetId).toBe(sharedCreative.id);

    // Verify copy synced
    const [syncedTargetVer] = await db.select().from(submissionVersions).where(eq(submissionVersions.id, targetVer.id));
    expect(syncedTargetVer.caption).toBe("LinkedIn Source Copy");

    // Sibling target item is now eligible for submission with the synced creative
    const eligibility = await resolveSubmissionEligibility(db, targetItem.id, founderUser.id);
    expect(eligibility.data!.eligible).toBe(true);
    expect(eligibility.data!.hasCreativeAsset).toBe(true);
  });
});
