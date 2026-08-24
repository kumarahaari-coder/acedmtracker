"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  AppState,
  ApprovalComponentType,
  ApprovalDecision,
  Asset,
  AnalyticsSnapshot,
  AuditRecord,
  Campaign,
  ChangeRequest,
  Comment,
  Annotation,
  ComponentDecision,
  ContentItem,
  DeadlineRecord,
  ExternalReviewLink,
  FounderOverride,
  ImportBatch,
  Notification,
  Project,
  PublicationRecord,
  Script,
  SubmissionAsset,
  SubmissionVersion,
  UserRole,
} from "../types";
import { loadStoredState, saveStoredState, resetStoredState } from "../migrations";
import { getInitialDeterministicState } from "../mockData";
import { computeVersionFingerprints, computeCopyFingerprint, computeCreativeFingerprint, computePostingDateFingerprint } from "../fingerprints";

interface AppStateContextType {
  state: AppState;
  recoveryNotice: string | null;
  dismissRecoveryNotice: () => void;
  resetAllData: () => void;
  // Project & Campaign Actions
  createProject: (project: Omit<Project, "id" | "createdAt">) => Project;
  archiveProject: (projectId: string, reason?: string) => void;
  restoreProject: (projectId: string) => void;
  createCampaign: (campaign: Omit<Campaign, "id">) => Campaign;
  // Content Actions
  createContentItem: (item: Omit<ContentItem, "id" | "currentVersionNumber">, initialCopy?: any, initialAssets?: SubmissionAsset[]) => ContentItem;
  updateContentItem: (itemId: string, updates: Partial<ContentItem>, reason?: string) => void;
  createDraftVersion: (itemId: string, baseVersionId?: string) => SubmissionVersion;
  updateDraftVersion: (versionId: string, updates: Partial<SubmissionVersion>) => void;
  submitVersion: (versionId: string, actorUserId: string) => void;
  // Approvals & Overrides
  recordApprovalDecision: (params: {
    contentItemId: string;
    submissionVersionId: string;
    component: ApprovalComponentType;
    decision: ComponentDecision;
    note?: string;
    reviewerUserId: string;
    reviewerRole: "founder" | "consultant";
  }) => void;
  recordFounderOverride: (params: {
    contentItemId: string;
    submissionVersionId: string;
    component?: ApprovalComponentType;
    reason: string;
    actorUserId: string;
  }) => void;
  revokeApprovalDecision: (decisionId: string, reason: string, actorUserId: string) => void;
  // Change Requests & Resubmission
  createChangeRequest: (req: Omit<ChangeRequest, "id" | "status" | "createdAt">) => ChangeRequest;
  respondToChangeRequest: (requestId: string, responseText: string, evidenceAssetId?: string) => void;
  resolveChangeRequest: (requestId: string, newStatus: "resolved" | "waived" | "disputed", reason?: string) => void;
  resubmitItemVersion: (params: {
    contentItemId: string;
    draftVersionId: string;
    actorUserId: string;
  }) => { success: boolean; error?: string };
  // Publication & Analytics
  markPublished: (params: {
    contentItemId: string;
    submissionVersionId: string;
    liveUrl: string;
    actorUserId: string;
    externalEditOccurred?: boolean;
    externalEditNote?: string;
  }) => void;
  importAnalyticsBatch: (params: {
    projectId: string;
    filename: string;
    rows: Array<{
      contentItemId: string;
      platform: any;
      reach: number;
      impressions: number;
      engagementRate: number;
      clicks: number;
      leads: number;
      revenue: number;
      snapshotDate: string;
    }>;
  }) => { success: boolean; validCount: number; duplicateCount: number; batchId: string };
  // Scripts & Assets
  createScript: (script: Omit<Script, "id" | "updatedAt">) => Script;
  updateScript: (scriptId: string, updates: Partial<Script>) => void;
  deleteScript: (scriptId: string) => void;
  linkScriptToContent: (scriptId: string, contentItemId: string) => void;
  addAsset: (asset: Omit<Asset, "id" | "createdAt">) => Asset;
  deleteAsset: (assetId: string) => void;
  // Comments & Annotations
  addComment: (comment: Omit<Comment, "id" | "createdAt">, annotation?: Omit<Annotation, "id" | "commentId" | "projectId">) => Comment;
  resolveComment: (commentId: string, actorUserId: string) => void;
  // Deadlines
  updateDeadline: (params: {
    contentItemId: string;
    kind: "submission" | "resubmission" | "approval_target" | "scheduled_publication";
    newDueAt: string;
    changedByUserId: string;
    reason: string;
  }) => void;
  // External Guest Links
  generateExternalReviewLink: (params: {
    projectId: string;
    contentItemId: string;
    submissionVersionId: string;
    createdByUserId: string;
    allowDownload: boolean;
    expiresInDays?: number;
  }) => ExternalReviewLink;
  revokeExternalReviewLink: (linkId: string) => void;
  // Notifications
  markNotificationRead: (notifId: string) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  // CRITICAL: Initialize state with getInitialDeterministicState() on both server and client initial render!
  const [state, setState] = useState<AppState>(getInitialDeterministicState);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Load stored browser state only after hydration completes
    const loaded = loadStoredState();
    setState(loaded.state);
    if (loaded.recoveredFromCorrupted) {
      setRecoveryNotice(loaded.error || "Restored fresh deterministic sample data.");
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage on state changes once hydrated
  useEffect(() => {
    if (isHydrated) {
      saveStoredState(state);
    }
  }, [state, isHydrated]);

  const dismissRecoveryNotice = () => setRecoveryNotice(null);

  const resetAllData = () => {
    const fresh = resetStoredState();
    setState(fresh);
    setRecoveryNotice(null);
  };

  // Helper for logging audit events
  const createAuditEntry = (
    projectId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
    reason?: string,
    before?: any,
    after?: any
  ): AuditRecord => {
    const user = state.users.find((u) => u.id === actorUserId);
    return {
      id: "aud_" + Math.random().toString(36).substr(2, 9),
      projectId,
      actorUserId,
      actorName: user ? user.name : "System / Simulated User",
      actorRole: (user ? (user.id === "u_founder" ? "founder" : user.id === "u_consultant" ? "consultant" : user.id === "u_admin" ? "admin" : "designer") : "founder") as UserRole,
      action,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
      summary,
      reason,
      before,
      after,
    };
  };

  // --- PROJECT ACTIONS ---
  const createProject = (projectData: Omit<Project, "id" | "createdAt">): Project => {
    const newId = "proj_" + Math.random().toString(36).substr(2, 9);
    const newProject: Project = {
      ...projectData,
      id: newId,
      createdAt: new Date().toISOString(),
    };
    const audit = createAuditEntry(newId, "u_founder", "create_project", "project", newId, `Created project '${newProject.name}'`);
    setState((prev) => ({
      ...prev,
      projects: [...prev.projects, newProject],
      auditRecords: [audit, ...prev.auditRecords],
    }));
    return newProject;
  };

  const archiveProject = (projectId: string, reason?: string) => {
    const audit = createAuditEntry(projectId, "u_admin", "archive_project", "project", projectId, `Archived project ${projectId}`, reason);
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId ? { ...p, status: "archived", archivedAt: new Date().toISOString() } : p
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));
  };

  const restoreProject = (projectId: string) => {
    const audit = createAuditEntry(projectId, "u_admin", "restore_project", "project", projectId, `Restored project ${projectId}`);
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId ? { ...p, status: "active", archivedAt: undefined } : p
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));
  };

  const createCampaign = (campData: Omit<Campaign, "id">): Campaign => {
    const newId = "camp_" + Math.random().toString(36).substr(2, 9);
    const newCamp: Campaign = { ...campData, id: newId };
    const audit = createAuditEntry(campData.projectId, campData.ownerId, "create_campaign", "campaign", newId, `Created campaign '${newCamp.name}'`);
    setState((prev) => ({
      ...prev,
      campaigns: [...prev.campaigns, newCamp],
      auditRecords: [audit, ...prev.auditRecords],
    }));
    return newCamp;
  };

  // --- CONTENT ACTIONS ---
  const createContentItem = (
    itemData: Omit<ContentItem, "id" | "currentVersionNumber">,
    initialCopy?: any,
    initialAssets: SubmissionAsset[] = []
  ): ContentItem => {
    const newId = "item_" + Math.random().toString(36).substr(2, 9);
    const v1Id = "ver_" + newId + "_v1";

    const copy = initialCopy || {
      caption: "Draft copy for " + itemData.title,
      hashtags: ["marketing", "growth"],
      cta: "Learn more at our website.",
    };

    const fingerprints = computeVersionFingerprints({
      copy,
      creativeAssets: initialAssets,
      scheduledDate: itemData.deadlines.scheduledPublicationDate,
    });

    const v1: SubmissionVersion = {
      id: v1Id,
      contentItemId: newId,
      versionNumber: 1,
      isDraft: true,
      createdAt: new Date().toISOString(),
      copy,
      creativeAssets: initialAssets,
      scheduledDate: itemData.deadlines.scheduledPublicationDate,
      componentFingerprints: fingerprints,
    };

    const newItem: ContentItem = {
      ...itemData,
      id: newId,
      currentVersionNumber: 1,
      activeDraftVersionId: v1Id,
    };

    const audit = createAuditEntry(
      itemData.projectId,
      itemData.accountableOwnerId,
      "create_content_item",
      "content_item",
      newId,
      `Created content item '${newItem.title}'`
    );

    const deadlineRec: DeadlineRecord = {
      id: "dl_" + Math.random().toString(36).substr(2, 9),
      projectId: itemData.projectId,
      contentItemId: newId,
      kind: "submission",
      dueAt: itemData.deadlines.submissionDeadline || new Date().toISOString(),
      changedByUserId: itemData.accountableOwnerId,
      changeReason: "Initial brief assignment",
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      contentItems: [...prev.contentItems, newItem],
      submissionVersions: [...prev.submissionVersions, v1],
      deadlineRecords: [...prev.deadlineRecords, deadlineRec],
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return newItem;
  };

  const updateContentItem = (itemId: string, updates: Partial<ContentItem>, reason?: string) => {
    setState((prev) => {
      const item = prev.contentItems.find((i) => i.id === itemId);
      if (!item) return prev;
      const audit = createAuditEntry(
        item.projectId,
        "u_consultant",
        "update_content_item",
        "content_item",
        itemId,
        `Updated content item '${item.title}'`,
        reason,
        item,
        updates
      );
      return {
        ...prev,
        contentItems: prev.contentItems.map((i) => (i.id === itemId ? { ...i, ...updates } : i)),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const createDraftVersion = (itemId: string, baseVersionId?: string): SubmissionVersion => {
    const item = state.contentItems.find((i) => i.id === itemId);
    if (!item) throw new Error("Item not found");

    const baseVersion = baseVersionId
      ? state.submissionVersions.find((v) => v.id === baseVersionId)
      : state.submissionVersions
          .filter((v) => v.contentItemId === itemId)
          .sort((a, b) => b.versionNumber - a.versionNumber)[0];

    const nextVerNum = (baseVersion ? baseVersion.versionNumber : 0) + 1;
    const newVerId = `ver_${itemId}_v${nextVerNum}`;

    const newVersion: SubmissionVersion = {
      id: newVerId,
      contentItemId: itemId,
      versionNumber: nextVerNum,
      isDraft: true,
      createdAt: new Date().toISOString(),
      copy: baseVersion ? { ...baseVersion.copy, hashtags: [...baseVersion.copy.hashtags] } : { caption: "", hashtags: [], cta: "" },
      creativeAssets: baseVersion ? [...baseVersion.creativeAssets] : [],
      scheduledDate: baseVersion ? baseVersion.scheduledDate : undefined,
      componentFingerprints: baseVersion
        ? { ...baseVersion.componentFingerprints }
        : { copyFingerprint: "", creativeFingerprint: "", postingDateFingerprint: "" },
    };

    setState((prev) => ({
      ...prev,
      submissionVersions: [...prev.submissionVersions, newVersion],
      contentItems: prev.contentItems.map((i) =>
        i.id === itemId ? { ...i, activeDraftVersionId: newVerId, currentVersionNumber: nextVerNum } : i
      ),
    }));

    return newVersion;
  };

  const updateDraftVersion = (versionId: string, updates: Partial<SubmissionVersion>) => {
    setState((prev) => ({
      ...prev,
      submissionVersions: prev.submissionVersions.map((v) => {
        if (v.id !== versionId) return v;
        const updated = { ...v, ...updates };
        // Recalculate fingerprints
        updated.componentFingerprints = computeVersionFingerprints({
          copy: updated.copy,
          creativeAssets: updated.creativeAssets,
          scheduledDate: updated.scheduledDate,
        });
        return updated;
      }),
    }));
  };

  const submitVersion = (versionId: string, actorUserId: string) => {
    setState((prev) => {
      const version = prev.submissionVersions.find((v) => v.id === versionId);
      if (!version) return prev;
      const item = prev.contentItems.find((i) => i.id === version.contentItemId);
      if (!item) return prev;

      const frozenVersion: SubmissionVersion = {
        ...version,
        isDraft: false,
        submittedAt: new Date().toISOString(),
        componentFingerprints: computeVersionFingerprints({
          copy: version.copy,
          creativeAssets: version.creativeAssets,
          scheduledDate: version.scheduledDate,
        }),
      };

      const audit = createAuditEntry(
        item.projectId,
        actorUserId,
        "submit_version",
        "submission_version",
        versionId,
        `Submitted version ${version.versionNumber} of '${item.title}' for review.`
      );

      const notifFounder: Notification = {
        id: "notif_" + Math.random().toString(36).substr(2, 9),
        projectId: item.projectId,
        recipientUserId: "u_founder",
        eventType: "submission",
        entityType: "content_item",
        entityId: item.id,
        title: `Version ${version.versionNumber} Submitted for Review`,
        message: `'${item.title}' is ready for Founder and Consultant approval.`,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        submissionVersions: prev.submissionVersions.map((v) => (v.id === versionId ? frozenVersion : v)),
        contentItems: prev.contentItems.map((i) =>
          i.id === item.id
            ? { ...i, stage: "in_review", latestSubmittedVersionId: versionId, activeDraftVersionId: undefined }
            : i
        ),
        notifications: [notifFounder, ...prev.notifications],
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  // --- APPROVAL DECISIONS ---
  const recordApprovalDecision = (params: {
    contentItemId: string;
    submissionVersionId: string;
    component: ApprovalComponentType;
    decision: ComponentDecision;
    note?: string;
    reviewerUserId: string;
    reviewerRole: "founder" | "consultant";
  }) => {
    setState((prev) => {
      const version = prev.submissionVersions.find((v) => v.id === params.submissionVersionId);
      const item = prev.contentItems.find((i) => i.id === params.contentItemId);
      if (!version || !item) return prev;

      const fingerprint =
        params.component === "copy"
          ? version.componentFingerprints.copyFingerprint
          : params.component === "creative"
          ? version.componentFingerprints.creativeFingerprint
          : version.componentFingerprints.postingDateFingerprint;

      const newDecision: ApprovalDecision = {
        id: "dec_" + Math.random().toString(36).substr(2, 9),
        projectId: item.projectId,
        contentItemId: params.contentItemId,
        submissionVersionId: params.submissionVersionId,
        component: params.component,
        componentFingerprint: fingerprint,
        reviewerUserId: params.reviewerUserId,
        reviewerRole: params.reviewerRole,
        decision: params.decision,
        note: params.note,
        decidedAt: new Date().toISOString(),
      };

      const updatedDecisions = [...prev.approvalDecisions, newDecision];

      // Re-evaluate overall stage
      const allActiveDecisions = updatedDecisions.filter(
        (d) => d.submissionVersionId === version.id && !d.revokedAt
      );

      const hasRejectionOrConditions = allActiveDecisions.some(
        (d) => d.decision === "changes_requested" || d.decision === "approved_with_conditions"
      );

      // Check if all 3 components are approved by BOTH founder and consultant
      const copyApproved =
        allActiveDecisions.some((d) => d.component === "copy" && d.reviewerRole === "founder" && d.decision === "approved") &&
        allActiveDecisions.some((d) => d.component === "copy" && d.reviewerRole === "consultant" && d.decision === "approved");

      const creativeApproved =
        allActiveDecisions.some((d) => d.component === "creative" && d.reviewerRole === "founder" && d.decision === "approved") &&
        allActiveDecisions.some((d) => d.component === "creative" && d.reviewerRole === "consultant" && d.decision === "approved");

      const dateApproved =
        allActiveDecisions.some((d) => d.component === "posting_date" && d.reviewerRole === "founder" && d.decision === "approved") &&
        allActiveDecisions.some((d) => d.component === "posting_date" && d.reviewerRole === "consultant" && d.decision === "approved");

      let nextStage = item.stage;
      if (hasRejectionOrConditions) {
        nextStage = "changes_requested";
      } else if (copyApproved && creativeApproved && dateApproved) {
        nextStage = "approved";
      } else {
        nextStage = "in_review";
      }

      const audit = createAuditEntry(
        item.projectId,
        params.reviewerUserId,
        "approval_decision",
        "approval_decision",
        newDecision.id,
        `${params.reviewerRole.toUpperCase()} marked ${params.component} as ${params.decision.toUpperCase()} on '${item.title}'`,
        params.note
      );

      return {
        ...prev,
        approvalDecisions: updatedDecisions,
        contentItems: prev.contentItems.map((i) => (i.id === item.id ? { ...i, stage: nextStage } : i)),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const recordFounderOverride = (params: {
    contentItemId: string;
    submissionVersionId: string;
    component?: ApprovalComponentType;
    reason: string;
    actorUserId: string;
  }) => {
    setState((prev) => {
      const item = prev.contentItems.find((i) => i.id === params.contentItemId);
      if (!item) return prev;

      const override: FounderOverride = {
        id: "ovr_" + Math.random().toString(36).substr(2, 9),
        projectId: item.projectId,
        contentItemId: params.contentItemId,
        submissionVersionId: params.submissionVersionId,
        component: params.component,
        reason: params.reason,
        actorUserId: params.actorUserId,
        createdAt: new Date().toISOString(),
      };

      const audit = createAuditEntry(
        item.projectId,
        params.actorUserId,
        "founder_override",
        "founder_override",
        override.id,
        `FOUNDER OVERRIDE applied to '${item.title}'. Stage progressed to APPROVED.`,
        params.reason
      );

      return {
        ...prev,
        founderOverrides: [...prev.founderOverrides, override],
        contentItems: prev.contentItems.map((i) => (i.id === item.id ? { ...i, stage: "approved" } : i)),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const revokeApprovalDecision = (decisionId: string, reason: string, actorUserId: string) => {
    setState((prev) => {
      const dec = prev.approvalDecisions.find((d) => d.id === decisionId);
      if (!dec) return prev;
      const item = prev.contentItems.find((i) => i.id === dec.contentItemId);
      if (!item) return prev;

      const updatedDecs = prev.approvalDecisions.map((d) =>
        d.id === decisionId
          ? { ...d, revokedAt: new Date().toISOString(), revocationReason: reason }
          : d
      );

      const audit = createAuditEntry(
        item.projectId,
        actorUserId,
        "revoke_approval",
        "approval_decision",
        decisionId,
        `Revoked approval for ${dec.component} by ${dec.reviewerRole}. Stage reverted to IN REVIEW.`,
        reason
      );

      return {
        ...prev,
        approvalDecisions: updatedDecs,
        contentItems: prev.contentItems.map((i) => (i.id === item.id ? { ...i, stage: "in_review" } : i)),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  // --- CHANGE REQUESTS & RESUBMISSION ---
  const createChangeRequest = (reqData: Omit<ChangeRequest, "id" | "status" | "createdAt">): ChangeRequest => {
    const newReq: ChangeRequest = {
      ...reqData,
      id: "cr_" + Math.random().toString(36).substr(2, 9),
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const audit = createAuditEntry(
      reqData.projectId,
      reqData.reviewerUserId,
      "create_change_request",
      "change_request",
      newReq.id,
      `Requested change on ${reqData.component}: '${reqData.requestedChange}'`,
      reqData.priority
    );
    setState((prev) => ({
      ...prev,
      changeRequests: [...prev.changeRequests, newReq],
      auditRecords: [audit, ...prev.auditRecords],
    }));
    return newReq;
  };

  const respondToChangeRequest = (requestId: string, responseText: string, evidenceAssetId?: string) => {
    setState((prev) => {
      const req = prev.changeRequests.find((r) => r.id === requestId);
      if (!req) return prev;
      const audit = createAuditEntry(
        req.projectId,
        "u_designer1",
        "respond_change_request",
        "change_request",
        requestId,
        `Designer addressed change request: '${responseText}'`
      );
      return {
        ...prev,
        changeRequests: prev.changeRequests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: "addressed",
                designerResponse: {
                  text: responseText,
                  evidenceAssetId,
                  addressedInVersionId: r.submissionVersionId,
                  respondedAt: new Date().toISOString(),
                },
              }
            : r
        ),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const resolveChangeRequest = (requestId: string, newStatus: "resolved" | "waived" | "disputed", reason?: string) => {
    setState((prev) => {
      const req = prev.changeRequests.find((r) => r.id === requestId);
      if (!req) return prev;
      const audit = createAuditEntry(
        req.projectId,
        "u_consultant",
        "resolve_change_request",
        "change_request",
        requestId,
        `Change request status changed to ${newStatus.toUpperCase()}`,
        reason
      );
      return {
        ...prev,
        changeRequests: prev.changeRequests.map((r) => (r.id === requestId ? { ...r, status: newStatus } : r)),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const resubmitItemVersion = (params: {
    contentItemId: string;
    draftVersionId: string;
    actorUserId: string;
  }): { success: boolean; error?: string } => {
    const item = state.contentItems.find((i) => i.id === params.contentItemId);
    const draft = state.submissionVersions.find((v) => v.id === params.draftVersionId);
    if (!item || !draft) return { success: false, error: "Content item or draft version not found." };

    // Check that all open change requests have been responded to (addressed or resolved)
    const openUnaddressed = state.changeRequests.filter(
      (cr) => cr.contentItemId === item.id && cr.status === "open"
    );
    if (openUnaddressed.length > 0) {
      return {
        success: false,
        error: `Cannot resubmit: ${openUnaddressed.length} change request(s) require a Designer response before resubmission.`,
      };
    }

    // Freeze new version
    const prevSubmittedVersion = item.latestSubmittedVersionId
      ? state.submissionVersions.find((v) => v.id === item.latestSubmittedVersionId)
      : null;

    const newFingerprints = computeVersionFingerprints({
      copy: draft.copy,
      creativeAssets: draft.creativeAssets,
      scheduledDate: draft.scheduledDate,
    });

    const frozenVersion: SubmissionVersion = {
      ...draft,
      isDraft: false,
      submittedAt: new Date().toISOString(),
      componentFingerprints: newFingerprints,
    };

    // Determine selective approval carries / invalidations
    const newDecisions: ApprovalDecision[] = [];

    if (prevSubmittedVersion) {
      const copyUnchanged = prevSubmittedVersion.componentFingerprints.copyFingerprint === newFingerprints.copyFingerprint;
      const creativeUnchanged = prevSubmittedVersion.componentFingerprints.creativeFingerprint === newFingerprints.creativeFingerprint;
      const dateUnchanged = prevSubmittedVersion.componentFingerprints.postingDateFingerprint === newFingerprints.postingDateFingerprint;

      // Carry forward unchanged approved decisions
      state.approvalDecisions
        .filter((d) => d.submissionVersionId === prevSubmittedVersion.id && !d.revokedAt && d.decision === "approved")
        .forEach((oldDec) => {
          if (
            (oldDec.component === "copy" && copyUnchanged) ||
            (oldDec.component === "creative" && creativeUnchanged) ||
            (oldDec.component === "posting_date" && dateUnchanged)
          ) {
            newDecisions.push({
              ...oldDec,
              id: "dec_" + Math.random().toString(36).substr(2, 9),
              submissionVersionId: frozenVersion.id,
              componentFingerprint:
                oldDec.component === "copy"
                  ? newFingerprints.copyFingerprint
                  : oldDec.component === "creative"
                  ? newFingerprints.creativeFingerprint
                  : newFingerprints.postingDateFingerprint,
              note: `Carried forward (component unchanged between v${prevSubmittedVersion.versionNumber} and v${frozenVersion.versionNumber})`,
              decidedAt: new Date().toISOString(),
            });
          }
        });
    }

    const audit = createAuditEntry(
      item.projectId,
      params.actorUserId,
      "resubmit_version",
      "submission_version",
      frozenVersion.id,
      `Resubmitted '${item.title}' as version ${frozenVersion.versionNumber}. Affected component approvals selectively reset.`
    );

    setState((prev) => ({
      ...prev,
      submissionVersions: prev.submissionVersions.map((v) => (v.id === draft.id ? frozenVersion : v)),
      approvalDecisions: [...prev.approvalDecisions, ...newDecisions],
      contentItems: prev.contentItems.map((i) =>
        i.id === item.id
          ? { ...i, stage: "in_review", latestSubmittedVersionId: frozenVersion.id, activeDraftVersionId: undefined }
          : i
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  // --- PUBLICATION & ANALYTICS ---
  const markPublished = (params: {
    contentItemId: string;
    submissionVersionId: string;
    liveUrl: string;
    actorUserId: string;
    externalEditOccurred?: boolean;
    externalEditNote?: string;
  }) => {
    setState((prev) => {
      const item = prev.contentItems.find((i) => i.id === params.contentItemId);
      if (!item) return prev;

      const pubRec: PublicationRecord = {
        id: "pub_" + Math.random().toString(36).substr(2, 9),
        projectId: item.projectId,
        contentItemId: params.contentItemId,
        submissionVersionId: params.submissionVersionId,
        liveUrl: params.liveUrl,
        publishedAt: new Date().toISOString(),
        markedPublishedByUserId: params.actorUserId,
        externalEditOccurred: !!params.externalEditOccurred,
        externalEditNote: params.externalEditNote,
      };

      const audit = createAuditEntry(
        item.projectId,
        params.actorUserId,
        "mark_published",
        "publication_record",
        pubRec.id,
        `Marked '${item.title}' as PUBLISHED at ${params.liveUrl}`
      );

      return {
        ...prev,
        publicationRecords: [...prev.publicationRecords, pubRec],
        contentItems: prev.contentItems.map((i) =>
          i.id === item.id ? { ...i, stage: "published", liveUrl: params.liveUrl } : i
        ),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const importAnalyticsBatch = (params: {
    projectId: string;
    filename: string;
    rows: Array<{
      contentItemId: string;
      platform: any;
      reach: number;
      impressions: number;
      engagementRate: number;
      clicks: number;
      leads: number;
      revenue: number;
      snapshotDate: string;
    }>;
  }) => {
    const batchId = "imp_batch_" + Math.random().toString(36).substr(2, 9);
    let validCount = 0;
    let duplicateCount = 0;
    const newSnapshots: AnalyticsSnapshot[] = [];

    params.rows.forEach((row) => {
      // Check duplicate snapshot on same date & item
      const isDuplicate = state.analyticsSnapshots.some(
        (s) => s.contentItemId === row.contentItemId && s.snapshotDate === row.snapshotDate
      );
      if (isDuplicate) {
        duplicateCount++;
      } else {
        validCount++;
        newSnapshots.push({
          id: "snap_" + Math.random().toString(36).substr(2, 9),
          projectId: params.projectId,
          contentItemId: row.contentItemId,
          platform: row.platform,
          reach: row.reach,
          impressions: row.impressions,
          engagementRate: row.engagementRate,
          clicks: row.clicks,
          leads: row.leads,
          revenue: row.revenue,
          snapshotDate: row.snapshotDate,
          importBatchId: batchId,
        });
      }
    });

    const batchRecord: ImportBatch = {
      id: batchId,
      projectId: params.projectId,
      filename: params.filename,
      status: "committed",
      mapping: { processed: "true" },
      validRowCount: validCount,
      invalidRowCount: 0,
      duplicateRowCount: duplicateCount,
      createdAt: new Date().toISOString(),
    };

    const audit = createAuditEntry(
      params.projectId,
      "u_consultant",
      "import_analytics",
      "import_batch",
      batchId,
      `Imported analytics file '${params.filename}' (${validCount} valid, ${duplicateCount} duplicates skipped)`
    );

    setState((prev) => ({
      ...prev,
      importBatches: [...prev.importBatches, batchRecord],
      analyticsSnapshots: [...prev.analyticsSnapshots, ...newSnapshots],
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true, validCount, duplicateCount, batchId };
  };

  // --- SCRIPTS & ASSETS ---
  const createScript = (scriptData: Omit<Script, "id" | "updatedAt">): Script => {
    const newScript: Script = {
      ...scriptData,
      id: "scr_" + Math.random().toString(36).substr(2, 9),
      updatedAt: new Date().toISOString(),
    };
    const audit = createAuditEntry(
      scriptData.projectId,
      "u_consultant",
      "create_script",
      "script",
      newScript.id,
      `Created script '${newScript.title}'`
    );
    setState((prev) => ({
      ...prev,
      scripts: [...prev.scripts, newScript],
      auditRecords: [audit, ...prev.auditRecords],
    }));
    return newScript;
  };

  const updateScript = (scriptId: string, updates: Partial<Script>) => {
    setState((prev) => ({
      ...prev,
      scripts: prev.scripts.map((s) =>
        s.id === scriptId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      ),
    }));
  };

  const deleteScript = (scriptId: string) => {
    setState((prev) => {
      const script = prev.scripts.find((s) => s.id === scriptId);
      if (!script) return prev;
      const audit = createAuditEntry(
        script.projectId,
        "u_consultant",
        "delete_script",
        "script",
        scriptId,
        `Deleted script '${script.title}'`
      );
      return {
        ...prev,
        scripts: prev.scripts.filter((s) => s.id !== scriptId),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const linkScriptToContent = (scriptId: string, contentItemId: string) => {
    setState((prev) => ({
      ...prev,
      scripts: prev.scripts.map((s) =>
        s.id === scriptId ? { ...s, linkedContentItemId: contentItemId, status: "linked" } : s
      ),
    }));
  };

  const addAsset = (assetData: Omit<Asset, "id" | "createdAt">): Asset => {
    const newAsset: Asset = {
      ...assetData,
      id: "ast_" + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    const audit = createAuditEntry(
      assetData.projectId,
      assetData.uploadedByUserId,
      "upload_asset",
      "asset",
      newAsset.id,
      `Uploaded asset '${newAsset.name}' (${(newAsset.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB)`
    );
    setState((prev) => ({
      ...prev,
      assets: [...prev.assets, newAsset],
      auditRecords: [audit, ...prev.auditRecords],
    }));
    return newAsset;
  };

  const deleteAsset = (assetId: string) => {
    setState((prev) => {
      const asset = prev.assets.find((a) => a.id === assetId);
      if (!asset) return prev;
      const audit = createAuditEntry(
        asset.projectId,
        "u_admin",
        "delete_asset",
        "asset",
        assetId,
        `Deleted asset '${asset.name}'`
      );
      return {
        ...prev,
        assets: prev.assets.filter((a) => a.id !== assetId),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  // --- COMMENTS & ANNOTATIONS ---
  const addComment = (
    commentData: Omit<Comment, "id" | "createdAt">,
    annotationData?: Omit<Annotation, "id" | "commentId" | "projectId">
  ): Comment => {
    const commentId = "comm_" + Math.random().toString(36).substr(2, 9);
    const newComment: Comment = {
      ...commentData,
      id: commentId,
      createdAt: new Date().toISOString(),
    };

    let newAnnotation: Annotation | undefined;
    if (annotationData) {
      newAnnotation = {
        ...annotationData,
        id: "ann_" + Math.random().toString(36).substr(2, 9),
        commentId,
        projectId: commentData.projectId,
      };
    }

    setState((prev) => ({
      ...prev,
      comments: [...prev.comments, newComment],
      annotations: newAnnotation ? [...prev.annotations, newAnnotation] : prev.annotations,
    }));
    return newComment;
  };

  const resolveComment = (commentId: string, actorUserId: string) => {
    setState((prev) => ({
      ...prev,
      comments: prev.comments.map((c) =>
        c.id === commentId
          ? { ...c, resolvedAt: new Date().toISOString(), resolvedByUserId: actorUserId }
          : c
      ),
    }));
  };

  // --- DEADLINES ---
  const updateDeadline = (params: {
    contentItemId: string;
    kind: "submission" | "resubmission" | "approval_target" | "scheduled_publication";
    newDueAt: string;
    changedByUserId: string;
    reason: string;
  }) => {
    setState((prev) => {
      const item = prev.contentItems.find((i) => i.id === params.contentItemId);
      if (!item) return prev;

      const newRec: DeadlineRecord = {
        id: "dl_" + Math.random().toString(36).substr(2, 9),
        projectId: item.projectId,
        contentItemId: params.contentItemId,
        kind: params.kind,
        dueAt: params.newDueAt,
        changedByUserId: params.changedByUserId,
        changeReason: params.reason,
        createdAt: new Date().toISOString(),
      };

      const updatedDeadlines = { ...item.deadlines };
      if (params.kind === "submission") updatedDeadlines.submissionDeadline = params.newDueAt;
      else if (params.kind === "resubmission") updatedDeadlines.resubmissionDeadline = params.newDueAt;
      else if (params.kind === "approval_target") updatedDeadlines.approvalTarget = params.newDueAt;
      else if (params.kind === "scheduled_publication") updatedDeadlines.scheduledPublicationDate = params.newDueAt;

      const audit = createAuditEntry(
        item.projectId,
        params.changedByUserId,
        "update_deadline",
        "deadline_record",
        newRec.id,
        `Rescheduled ${params.kind} deadline for '${item.title}' to ${params.newDueAt}`,
        params.reason
      );

      return {
        ...prev,
        deadlineRecords: [...prev.deadlineRecords, newRec],
        contentItems: prev.contentItems.map((i) =>
          i.id === item.id ? { ...i, deadlines: updatedDeadlines } : i
        ),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  // --- EXTERNAL GUEST LINKS ---
  const generateExternalReviewLink = (params: {
    projectId: string;
    contentItemId: string;
    submissionVersionId: string;
    createdByUserId: string;
    allowDownload: boolean;
    expiresInDays?: number;
  }): ExternalReviewLink => {
    const days = params.expiresInDays || 14;
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const token = "guest_token_" + Math.random().toString(36).substr(2, 12);

    const newLink: ExternalReviewLink = {
      id: "ext_" + Math.random().toString(36).substr(2, 9),
      projectId: params.projectId,
      contentItemId: params.contentItemId,
      submissionVersionId: params.submissionVersionId,
      demoToken: token,
      expiresAt: expires,
      allowDownload: params.allowDownload,
      createdByUserId: params.createdByUserId,
      createdAt: new Date().toISOString(),
    };

    const audit = createAuditEntry(
      params.projectId,
      params.createdByUserId,
      "create_guest_link",
      "external_review_link",
      newLink.id,
      `Generated external guest review link (valid for ${days} days)`
    );

    setState((prev) => ({
      ...prev,
      externalReviewLinks: [...prev.externalReviewLinks, newLink],
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return newLink;
  };

  const revokeExternalReviewLink = (linkId: string) => {
    setState((prev) => {
      const link = prev.externalReviewLinks.find((l) => l.id === linkId);
      if (!link) return prev;
      const audit = createAuditEntry(
        link.projectId,
        "u_consultant",
        "revoke_guest_link",
        "external_review_link",
        linkId,
        `Revoked external guest review link`
      );
      return {
        ...prev,
        externalReviewLinks: prev.externalReviewLinks.map((l) =>
          l.id === linkId ? { ...l, revokedAt: new Date().toISOString() } : l
        ),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const markNotificationRead = (notifId: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notifId ? { ...n, readAt: new Date().toISOString() } : n
      ),
    }));
  };

  return (
    <AppStateContext.Provider
      value={{
        state,
        recoveryNotice,
        dismissRecoveryNotice,
        resetAllData,
        createProject,
        archiveProject,
        restoreProject,
        createCampaign,
        createContentItem,
        updateContentItem,
        createDraftVersion,
        updateDraftVersion,
        submitVersion,
        recordApprovalDecision,
        recordFounderOverride,
        revokeApprovalDecision,
        createChangeRequest,
        respondToChangeRequest,
        resolveChangeRequest,
        resubmitItemVersion,
        markPublished,
        importAnalyticsBatch,
        createScript,
        updateScript,
        deleteScript,
        linkScriptToContent,
        addAsset,
        deleteAsset,
        addComment,
        resolveComment,
        updateDeadline,
        generateExternalReviewLink,
        revokeExternalReviewLink,
        markNotificationRead,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}
