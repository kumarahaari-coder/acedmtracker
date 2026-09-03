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
  User,
  ProjectMembership,
  UserRole,
  AssignmentRole,
  ContentAssignment,
  WorkSession,
  WorkSessionAdjustment,
  ContentGroup,
  ContentPlatform,
  ContentStage,
  ContentType,
  ScopeClassification,
  AttendanceRecord,
  AttendanceCorrection,
  ProjectObjectiveConfig,
} from "../types";
import { loadStoredState, saveStoredState, resetStoredState } from "../migrations";
import { getEmptyAppState } from "../state/empty";
import { getInitialDeterministicState } from "../mockData";
import { computeVersionFingerprints, computeCopyFingerprint, computeCreativeFingerprint, computePostingDateFingerprint } from "../fingerprints";

interface AppStateContextType {
  state: AppState;
  recoveryNotice: string | null;
  dismissRecoveryNotice: () => void;
  resetAllData: () => void;
  hydrateServerState: (serverState: AppState) => void;
  hydrateLayoutContext: (context: {
    projects: any[];
    projectMemberships: any[];
    unreadNotificationsCount?: number;
  }) => void;
  // Project & Campaign Actions
  createProject: (project: Omit<Project, "id" | "createdAt">, actorUserId?: string) => Promise<{ success: boolean; project?: Project; error?: string }>;
  updateProjectObjective: (params: {
    projectId: string;
    updates: Partial<ProjectObjectiveConfig>;
    actorUserId: string;
  }) => { success: boolean; error?: string };
  archiveProject: (projectId: string, reason?: string, actorUserId?: string) => Promise<{ success: boolean; error?: string }>;
  restoreProject: (projectId: string, actorUserId?: string) => Promise<{ success: boolean; error?: string }>;
  createCampaign: (campaign: Omit<Campaign, "id">, actorUserId?: string) => Promise<{ success: boolean; campaign?: Campaign; error?: string }>;
  // Content Groups & Multi-Platform (Phase 3)
  createContentGroupWithItems: (params: {
    projectId: string;
    title: string;
    description?: string;
    conceptNotes?: string;
    workType?: string;
    workTypeId?: string;
    scopeClassification?: ScopeClassification;
    workNature?: "planned" | "ad_hoc";
    actorUserId: string;
    platforms: Array<{
      platform: ContentPlatform;
      contentType: ContentType;
      accountableOwnerId: string;
      submissionDeadline: string;
      scheduledPublicationDate: string;
      collaboratorIds?: string[];
      scopeClassification?: ScopeClassification;
      adaptationSeconds?: number;
    }>;
    sharedInitialCopy?: {
      caption: string;
      hashtags: string[];
      cta: string;
      destinationUrl?: string;
    };
    sharedAssets?: SubmissionAsset[];
  }) => Promise<{ success: boolean; group?: ContentGroup; contentItems?: ContentItem[]; error?: string }>;
  syncContentGroupFields: (params: {
    contentGroupId: string;
    sourceItemId?: string;
    targetItemIds?: string[];
    syncCopy?: boolean;
    syncCreative?: boolean;
    syncScheduledDate?: boolean;
    customCopy?: {
      caption?: string;
      hashtags?: string[];
      cta?: string;
      destinationUrl?: string;
    };
    customAssets?: SubmissionAsset[];
    customScheduledDate?: string;
    actorUserId: string;
    reason?: string;
  }) => { success: boolean; error?: string; affectedItemCount?: number };
  // Content Actions & Assignments (Phase 2)
  createContentItem: (item: Omit<ContentItem, "id" | "currentVersionNumber">, initialCopy?: any, initialAssets?: SubmissionAsset[], actorUserId?: string) => Promise<{ success: boolean; item?: ContentItem; error?: string }>;
  updateContentItem: (itemId: string, updates: Partial<ContentItem>, reason?: string) => void;
  updateContentItemStage: (itemId: string, stage: ContentStage, actorUserId?: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  assignContentItem: (params: {
    projectId?: string;
    contentItemId: string;
    assigneeUserId: string;
    assignmentRole?: AssignmentRole;
    dueAt?: string;
    actorUserId: string;
    reason?: string;
  }) => Promise<{ success: boolean; assignment?: ContentAssignment; error?: string }>;
  acceptContentAssignment: (assignmentId: string, actorUserId: string) => { success: boolean; error?: string };
  updateAssignmentDeadline: (params: {
    assignmentId: string;
    newDueAt: string;
    reason: string;
    actorUserId: string;
  }) => { success: boolean; error?: string };
  // Work Sessions & Time Tracking (Phase 2)
  startWorkSession: (params: {
    projectId: string;
    contentItemId: string;
    assignmentId: string;
    userId: string;
    notes?: string;
  }) => { success: boolean; session?: WorkSession; error?: string; activeSession?: WorkSession };
  pauseWorkSession: (sessionId: string, actorUserId: string) => { success: boolean; error?: string };
  resumeWorkSession: (sessionId: string, actorUserId: string) => { success: boolean; error?: string; activeSession?: WorkSession };
  stopWorkSession: (sessionId: string, actorUserId: string, notes?: string) => { success: boolean; error?: string };
  adjustWorkSessionDuration: (params: {
    sessionId: string;
    adjustedDurationSeconds: number;
    reason: string;
    actorUserId: string;
  }) => { success: boolean; adjustment?: WorkSessionAdjustment; error?: string };
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
    submissionVersionId?: string;
    liveUrl: string;
    publishedAt?: string;
    actorUserId: string;
    externalEditOccurred?: boolean;
    externalEditNote?: string;
  }) => void;
  updatePublicationDetails: (params: {
    contentItemId: string;
    publishedAt?: string;
    liveUrl?: string;
    reason: string;
    actorUserId: string;
  }) => Promise<{ success: boolean; error?: string }>;
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
  createScript: (script: Omit<Script, "id" | "updatedAt">) => Promise<Script>;
  updateScript: (scriptId: string, updates: Partial<Script>) => Promise<void>;
  deleteScript: (scriptId: string) => void;
  linkScriptToContent: (scriptId: string, contentItemId: string) => Promise<void>;
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
  }) => Promise<{ success: boolean; error?: string }>;
  // Team Management & Memberships (Phase 1)
  createTeamMember: (data: {
    id?: string;
    name: string;
    email: string;
    role: UserRole;
    jobTitle?: string;
    workingHoursPerDay?: number;
    actorUserId: string;
  }) => Promise<{ success: boolean; user?: User; error?: string }>;
  updateTeamMember: (
    userId: string,
    updates: Partial<Pick<User, "name" | "email" | "role" | "jobTitle" | "workingHoursPerDay">>,
    actorUserId: string
  ) => { success: boolean; error?: string };
  updateTeamMemberStatus: (
    userId: string,
    newStatus: "active" | "inactive",
    actorUserId: string,
    reason?: string
  ) => { success: boolean; error?: string };
  permanentlyDeleteTeamMember: (
    userId: string,
    actorUserId: string,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  addProjectMember: (params: {
    projectId: string;
    userId: string;
    membershipRole?: UserRole;
    actorUserId: string;
  }) => Promise<{ success: boolean; membership?: ProjectMembership; error?: string }>;
  removeProjectMember: (
    membershipId: string,
    actorUserId: string,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
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
  // Attendance & Presence (Phase 2.1)
  checkInAttendance: (userId: string) => Promise<{ success: boolean; record?: AttendanceRecord; error?: string }>;
  checkOutAttendance: (userId: string) => Promise<{ success: boolean; record?: AttendanceRecord; error?: string }>;
  adjustAttendance: (params: {
    attendanceId: string;
    checkedInAt?: string;
    checkedOutAt?: string;
    reason: string;
    actorUserId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  // Client Portal & Visibility (Phase 5)
  setClientVisibility: (params: {
    contentItemId: string;
    clientVisible: boolean;
    actorUserId: string;
    reason?: string;
  }) => { success: boolean; error?: string };
  updateProjectClientAnalyticsConfig: (params: {
    projectId: string;
    allowedMetricKeys: string[];
    actorUserId: string;
  }) => { success: boolean; error?: string };
  addClientToProject: (params: {
    name: string;
    email: string;
    jobTitle?: string;
    phone?: string;
    projectId: string;
    actorUserId: string;
  }) => Promise<{ success: boolean; user?: User; membership?: ProjectMembership; error?: string }>;
  createClientUserAndAssign: (params: {
    name: string;
    email: string;
    projectId: string;
    actorUserId: string;
  }) => Promise<{ success: boolean; user?: User; membership?: ProjectMembership; error?: string }>;
  revokeClientAccess: (params: {
    projectId: string;
    userId: string;
    actorUserId: string;
    reason?: string;
  }) => { success: boolean; error?: string };
  reactivateClientAccess: (params: {
    projectId: string;
    userId: string;
    actorUserId: string;
  }) => { success: boolean; error?: string };
  // Notifications
  markNotificationRead: (notifId: string) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: AppState;
}) {
  const [state, setState] = useState<AppState>(() => {
    if (initialState) return initialState;
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
      return getInitialDeterministicState();
    }
    return getEmptyAppState();
  });
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  useEffect(() => {
    // Purge legacy storage keys if present in browser session
    loadStoredState();
  }, []);

  const hydrateServerState = (serverState: AppState) => {
    setState(serverState);
  };

  const hydrateLayoutContext = (context: {
    projects: any[];
    projectMemberships: any[];
    unreadNotificationsCount?: number;
  }) => {
    setState((prev) => ({
      ...prev,
      projects: context.projects.map((p) => {
        const existing = prev.projects.find((ep) => ep.id === p.id);
        return (
          existing || {
            id: p.id,
            name: p.name,
            clientName: p.clientBrand || p.name,
            clientBrand: p.clientBrand || p.name,
            avatar: "",
            scope: "",
            timezone: "Asia/Kolkata",
            status: p.status || "active",
            targetRequirements: { posts: 0, carousels: 0, reels: 0, trialReels: 0 },
            workflowStages: ["idea", "draft", "in_review", "approved", "published"],
            createdAt: new Date().toISOString(),
          }
        );
      }),
      projectMemberships: context.projectMemberships.map((m) => ({
        id: m.id,
        projectId: m.projectId,
        userId: m.userId,
        membershipRole: m.membershipRole,
        addedByUserId: "",
        addedAt: new Date().toISOString(),
        status: m.status || "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      notifications: Array(context.unreadNotificationsCount || 0)
        .fill(null)
        .map((_, i) => ({
          id: `unread_${i}`,
          orgId: "",
          projectId: "",
          recipientUserId: "",
          type: "assignment_due" as any,
          eventType: "assignment_due" as any,
          entityType: "content_item",
          entityId: "",
          title: "Notification",
          message: "",
          readAt: undefined,
          createdAt: new Date().toISOString(),
        })),
    }));
  };

  const dismissRecoveryNotice = () => setRecoveryNotice(null);

  const resetAllData = () => {
    setState(getEmptyAppState());
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
  const createProject = async (
    projectData: Omit<Project, "id" | "createdAt">,
    actorUserId?: string
  ): Promise<{ success: boolean; project?: Project; error?: string }> => {
    try {
      const { createProjectAction } = await import("../actions/projects");
      const res = await createProjectAction({
        name: projectData.name,
        clientBrand: projectData.clientBrand,
        scope: projectData.scope,
        engagementModel: projectData.engagementModel,
        actorUserId,
      });

      if (!res.success || !res.project) {
        return { success: false, error: res.error || "Failed to create project in database." };
      }

      const canonicalId = res.project.id;
      const newProject: Project = {
        ...projectData,
        id: canonicalId,
        legacyId: res.project.legacyId || undefined,
        name: res.project.name,
        clientBrand: res.project.clientBrand,
        status: (res.project.status as any) || "active",
        createdAt: res.project.createdAt,
      };

      const audit = createAuditEntry(
        canonicalId,
        actorUserId || "u_founder",
        "create_project",
        "project",
        canonicalId,
        `Created project '${newProject.name}'`
      );

      setState((prev) => ({
        ...prev,
        projects: [...prev.projects, newProject],
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, project: newProject };
    } catch (err: any) {
      console.error("Failed to create project:", err);
      return { success: false, error: err.message || "Failed to create project." };
    }
  };

  const updateProjectObjective = (params: {
    projectId: string;
    updates: Partial<ProjectObjectiveConfig>;
    actorUserId: string;
  }): { success: boolean; error?: string } => {
    const proj = state.projects.find((p) => p.id === params.projectId);
    if (!proj) return { success: false, error: "Project not found" };

    const updatedObjective: ProjectObjectiveConfig = {
      objectiveName: params.updates.objectiveName || proj.objectiveConfig?.objectiveName || "Primary Campaign Goal",
      metricName: params.updates.metricName || proj.objectiveConfig?.metricName || "Metric Target",
      targetValue: params.updates.targetValue !== undefined ? params.updates.targetValue : (proj.objectiveConfig?.targetValue || 100),
      currentValue: params.updates.currentValue !== undefined ? params.updates.currentValue : (proj.objectiveConfig?.currentValue || 0),
      startDate: params.updates.startDate || proj.objectiveConfig?.startDate,
      targetDate: params.updates.targetDate || proj.objectiveConfig?.targetDate,
      unit: params.updates.unit || proj.objectiveConfig?.unit,
      notes: params.updates.notes || proj.objectiveConfig?.notes,
    };

    const audit = createAuditEntry(
      params.projectId,
      params.actorUserId,
      "update_project_objective",
      "project",
      params.projectId,
      `Updated objective progress: ${updatedObjective.currentValue} / ${updatedObjective.targetValue} (${updatedObjective.metricName})`
    );

    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === params.projectId
          ? {
              ...p,
              objectiveConfig: updatedObjective,
            }
          : p
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const archiveProject = async (
    projectId: string,
    reason?: string,
    actorUserId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { archiveProjectAction } = await import("../actions/projects");
      const res = await archiveProjectAction({
        projectId,
        actorUserId,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to archive project." };
      }

      const audit = createAuditEntry(
        projectId,
        actorUserId || "u_admin",
        "archive_project",
        "project",
        projectId,
        `Archived project ${projectId}`,
        reason
      );

      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, status: "archived", archivedAt: new Date().toISOString() } : p
        ),
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const restoreProject = async (
    projectId: string,
    actorUserId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { restoreProjectAction } = await import("../actions/projects");
      const res = await restoreProjectAction({
        projectId,
        actorUserId,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to restore project." };
      }

      const audit = createAuditEntry(
        projectId,
        actorUserId || "u_admin",
        "restore_project",
        "project",
        projectId,
        `Restored project ${projectId}`
      );

      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, status: "active", archivedAt: undefined } : p
        ),
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const createCampaign = async (
    campData: Omit<Campaign, "id">,
    actorUserId?: string
  ): Promise<{ success: boolean; campaign?: Campaign; error?: string }> => {
    try {
      const { createCampaignAction } = await import("../actions/collaboration");
      const res = await createCampaignAction({
        projectId: campData.projectId,
        name: campData.name,
        objective: campData.objective,
        description: campData.description,
        status: campData.status as any,
        startDate: campData.startDate,
        endDate: campData.endDate,
        ownerId: campData.ownerId,
        actorUserId,
      });

      if (!res.success || !res.campaign) {
        return { success: false, error: res.error || "Failed to create campaign in database." };
      }

      const newCamp: Campaign = {
        id: res.campaign.id,
        projectId: res.campaign.projectId,
        name: res.campaign.name,
        objective: res.campaign.objective,
        description: res.campaign.description,
        status: res.campaign.status as any,
        startDate: res.campaign.startDate,
        endDate: res.campaign.endDate,
        ownerId: res.campaign.ownerId,
      };

      const audit = createAuditEntry(
        campData.projectId,
        campData.ownerId || actorUserId || "u_founder",
        "create_campaign",
        "campaign",
        newCamp.id,
        `Created campaign '${newCamp.name}'`
      );

      setState((prev) => ({
        ...prev,
        campaigns: [...prev.campaigns, newCamp],
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, campaign: newCamp };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // --- CONTENT ACTIONS ---
  const createContentItem = async (
    itemData: Omit<ContentItem, "id" | "currentVersionNumber">,
    initialCopy?: any,
    initialAssets: SubmissionAsset[] = [],
    actorUserId?: string
  ): Promise<{ success: boolean; item?: ContentItem; error?: string }> => {
    try {
      const { createContentItemAction } = await import("../actions/content");
      const res: any = await createContentItemAction({
        actorUserId: actorUserId || itemData.accountableOwnerId || "u_founder",
        projectId: itemData.projectId,
        title: itemData.title,
        platform: itemData.platform,
        contentType: itemData.contentType,
        workType: itemData.workType,
        workTypeId: itemData.workTypeId,
        campaignId: itemData.campaignId,
        contentPillar: itemData.contentPillar,
        topic: itemData.topic,
        brief: itemData.brief,
        referenceLink: itemData.referenceLink,
        priority: itemData.priority,
        workNature: itemData.workNature,
        accountOwnerId: itemData.accountOwnerId,
        scopeClassification: itemData.scopeClassification,
        scheduledPublicationDate: itemData.deadlines?.scheduledPublicationDate,
        submissionDeadline: itemData.deadlines?.submissionDeadline,
        accountableOwnerId: itemData.accountableOwnerId,
        initialCopy,
      });

      if (!res.success || !res.item) {
        return { success: false, error: res.error || "Failed to create content item in database." };
      }

      const canonicalItem: ContentItem = {
        ...itemData,
        id: res.item.id,
        currentVersionNumber: res.item.currentVersionNumber || 1,
        activeDraftVersionId: res.version?.id,
        scopeClassification: (res.item.scopeClassification as any) || itemData.scopeClassification || "contracted",
        workType: res.item.workType || itemData.workType,
        workTypeId: res.item.workTypeId || itemData.workTypeId,
        standardContentSeconds: res.item.standardContentSeconds ?? itemData.standardContentSeconds,
        standardProductionSeconds: res.item.standardProductionSeconds ?? itemData.standardProductionSeconds,
        finalPlannedSeconds: res.item.finalPlannedSeconds ?? itemData.finalPlannedSeconds,
        isEffortAnchor: res.item.isEffortAnchor ?? true,
      };

      const audit = createAuditEntry(
        itemData.projectId,
        itemData.accountableOwnerId,
        "create_content_item",
        "content_item",
        canonicalItem.id,
        `Created content item '${canonicalItem.title}'`
      );

      setState((prev) => ({
        ...prev,
        contentItems: [...prev.contentItems.filter((i) => i.id !== canonicalItem.id), canonicalItem],
        contentAssignments: res.assignment
          ? [
              ...prev.contentAssignments.filter((a) => a.id !== res.assignment!.id),
              {
                id: res.assignment.id,
                projectId: res.assignment.projectId,
                contentItemId: res.assignment.contentItemId,
                assigneeUserId: res.assignment.assigneeUserId,
                assignmentRole: res.assignment.assignmentRole as any,
                status: res.assignment.status as any,
                assignedByUserId: res.assignment.assignedByUserId,
                assignedAt: res.assignment.assignedAt.toISOString(),
                initialDueAt: res.assignment.initialDueAt.toISOString(),
                currentDueAt: res.assignment.currentDueAt.toISOString(),
                createdAt: res.assignment.createdAt.toISOString(),
                updatedAt: res.assignment.updatedAt.toISOString(),
              },
            ]
          : prev.contentAssignments,
        submissionVersions: res.version
          ? [
              ...prev.submissionVersions.filter((v) => v.id !== res.version!.id),
              {
                id: res.version.id,
                contentItemId: res.version.contentItemId,
                versionNumber: res.version.versionNumber,
                isDraft: res.version.isDraft,
                createdAt: res.version.createdAt.toISOString(),
                copy: (res.version.copy as any) || { caption: "", hashtags: [], cta: "" },
                creativeAssets: (res.version.creativeAssets as any) || [],
                scheduledDate: res.version.scheduledDate ? res.version.scheduledDate.toISOString() : undefined,
                componentFingerprints: res.version.componentFingerprints as any,
              },
            ]
          : prev.submissionVersions,
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, item: canonicalItem };
    } catch (err: any) {
      console.error("Failed to create content item:", err);
      return { success: false, error: err.message || "Failed to create content item." };
    }
  };

  // --- MULTI-PLATFORM CONTENT GROUPS (Phase 3) ---
  const createContentGroupWithItems = async (params: {
    projectId: string;
    title: string;
    description?: string;
    conceptNotes?: string;
    workType?: string;
    workTypeId?: string;
    scopeClassification?: ScopeClassification;
    workNature?: "planned" | "ad_hoc";
    actorUserId: string;
    platforms: Array<{
      platform: ContentPlatform;
      contentType: ContentType;
      accountableOwnerId: string;
      submissionDeadline: string;
      scheduledPublicationDate: string;
      collaboratorIds?: string[];
      scopeClassification?: ScopeClassification;
      adaptationSeconds?: number;
    }>;
    sharedInitialCopy?: {
      caption: string;
      hashtags: string[];
      cta: string;
      destinationUrl?: string;
    };
    sharedAssets?: SubmissionAsset[];
  }): Promise<{ success: boolean; group?: ContentGroup; contentItems?: ContentItem[]; error?: string }> => {
    try {
      const { createContentGroupAction } = await import("../actions/content");
      const res: any = await createContentGroupAction({
        actorUserId: params.actorUserId || "u_founder",
        projectId: params.projectId,
        title: params.title,
        description: params.description,
        conceptNotes: params.conceptNotes,
        workType: params.workType,
        workTypeId: params.workTypeId,
        scopeClassification: params.scopeClassification,
        workNature: params.workNature,
        platforms: params.platforms.map((p) => ({
          platform: p.platform,
          contentType: p.contentType,
          accountableOwnerId: p.accountableOwnerId,
          submissionDeadline: p.submissionDeadline,
          scheduledPublicationDate: p.scheduledPublicationDate,
          scopeClassification: p.scopeClassification,
          adaptationSeconds: p.adaptationSeconds,
        })),
        sharedInitialCopy: params.sharedInitialCopy,
      });

      if (!res.success || !res.group || !res.items) {
        return { success: false, error: res.error || "Failed to create content group in database." };
      }

      const now = new Date().toISOString();
      const authGroup: ContentGroup = {
        id: res.group.id,
        projectId: res.group.projectId,
        title: res.group.title,
        description: res.group.description || undefined,
        conceptNotes: res.group.conceptNotes || undefined,
        contentItemIds: res.items.map((i: any) => i.id),
        createdByUserId: res.group.createdByUserId,
        createdAt: res.group.createdAt ? new Date(res.group.createdAt).toISOString() : now,
        updatedAt: res.group.updatedAt ? new Date(res.group.updatedAt).toISOString() : now,
      };

      const authItems: ContentItem[] = res.items.map((i: any, idx: number) => {
        const ver = res.versions?.[idx];
        const asgn = res.assignments?.[idx];
        const p = params.platforms[idx];
        return {
          id: i.id,
          projectId: i.projectId,
          contentGroupId: res.group.id,
          title: i.title,
          platform: i.platform,
          contentType: i.contentType,
          workType: i.workType || params.workType,
          workTypeId: i.workTypeId || params.workTypeId,
          topic: i.topic,
          stage: i.stage,
          scopeClassification: i.scopeClassification || p?.scopeClassification || params.scopeClassification || "contracted",
          workNature: i.workNature || params.workNature || "planned",
          currentVersionNumber: i.currentVersionNumber,
          activeDraftVersionId: ver?.id,
          clientVisible: i.clientVisible || false,
          accountableOwnerId: asgn?.assigneeUserId || p?.accountableOwnerId || "",
          collaboratorIds: [],
          standardContentSeconds: i.standardContentSeconds,
          standardProductionSeconds: i.standardProductionSeconds,
          finalPlannedSeconds: i.finalPlannedSeconds,
          isEffortAnchor: i.isEffortAnchor,
          deadlines: {
            submissionDeadline: p?.submissionDeadline || now,
            scheduledPublicationDate: p?.scheduledPublicationDate,
          },
          scheduledPublicationDate: p?.scheduledPublicationDate,
          createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : now,
          updatedAt: i.updatedAt ? new Date(i.updatedAt).toISOString() : now,
        };
      });

      const authVersions: SubmissionVersion[] = (res.versions || []).map((ver: any) => ({
        id: ver.id,
        contentItemId: ver.contentItemId,
        versionNumber: ver.versionNumber,
        isDraft: ver.isDraft,
        createdAt: ver.createdAt ? new Date(ver.createdAt).toISOString() : now,
        copy: (ver.copy as any) || { caption: "", hashtags: [], cta: "" },
        creativeAssets: (ver.creativeAssets as any) || [],
        scheduledDate: ver.scheduledDate ? new Date(ver.scheduledDate).toISOString() : undefined,
        componentFingerprints: ver.componentFingerprints as any,
      }));

      const authAssignments: ContentAssignment[] = (res.assignments || []).map((asgn: any) => ({
        id: asgn.id,
        projectId: asgn.projectId,
        contentItemId: asgn.contentItemId,
        assigneeUserId: asgn.assigneeUserId,
        assignmentRole: asgn.assignmentRole,
        status: asgn.status,
        assignedByUserId: asgn.assignedByUserId,
        assignedAt: asgn.assignedAt ? new Date(asgn.assignedAt).toISOString() : now,
        initialDueAt: asgn.initialDueAt ? new Date(asgn.initialDueAt).toISOString() : now,
        currentDueAt: asgn.currentDueAt ? new Date(asgn.currentDueAt).toISOString() : now,
        createdAt: asgn.createdAt ? new Date(asgn.createdAt).toISOString() : now,
        updatedAt: asgn.updatedAt ? new Date(asgn.updatedAt).toISOString() : now,
      }));

      const audit = createAuditEntry(
        params.projectId,
        params.actorUserId,
        "create_content_group",
        "content_group",
        authGroup.id,
        `Created multi-platform content group '${params.title}' across ${params.platforms.map((p) => p.platform).join(", ")}`
      );

      setState((prev) => ({
        ...prev,
        contentGroups: [...prev.contentGroups, authGroup],
        contentItems: [...prev.contentItems, ...authItems],
        contentAssignments: [...prev.contentAssignments, ...authAssignments],
        submissionVersions: [...prev.submissionVersions, ...authVersions],
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, group: authGroup, contentItems: authItems };
    } catch (err: any) {
      console.error("Failed to create content group:", err);
      return { success: false, error: err.message || "Failed to create content group." };
    }
  };

  const syncContentGroupFields = (params: {
    contentGroupId: string;
    sourceItemId?: string;
    targetItemIds?: string[];
    syncCopy?: boolean;
    syncCreative?: boolean;
    syncScheduledDate?: boolean;
    customCopy?: {
      caption?: string;
      hashtags?: string[];
      cta?: string;
      destinationUrl?: string;
    };
    customAssets?: SubmissionAsset[];
    customScheduledDate?: string;
    actorUserId: string;
    reason?: string;
  }): { success: boolean; error?: string; affectedItemCount?: number } => {
    const group = state.contentGroups.find((g) => g.id === params.contentGroupId);
    if (!group) return { success: false, error: "Content group not found" };

    const siblingItems = state.contentItems.filter((i) =>
      params.targetItemIds ? params.targetItemIds.includes(i.id) : i.contentGroupId === group.id
    );

    if (siblingItems.length === 0) return { success: false, error: "No target sibling items found in group" };

    let sourceVersion: SubmissionVersion | undefined;
    if (params.sourceItemId) {
      const srcItem = state.contentItems.find((i) => i.id === params.sourceItemId);
      if (srcItem) {
        sourceVersion = state.submissionVersions.find(
          (v) => v.id === srcItem.latestSubmittedVersionId || v.id === srcItem.activeDraftVersionId
        );
      }
    }

    const now = new Date().toISOString();
    const updatedVersions: SubmissionVersion[] = [];
    const updatedItems: ContentItem[] = [];
    const resetDecisions: ApprovalDecision[] = [];

    for (const item of siblingItems) {
      // Find active or latest version
      const ver = state.submissionVersions.find(
        (v) => v.id === item.activeDraftVersionId || v.id === item.latestSubmittedVersionId
      );
      if (!ver) continue;

      let updatedCopy = { ...ver.copy };
      let updatedAssets = [...ver.creativeAssets];
      let updatedDate = ver.scheduledDate;

      if (params.syncCopy) {
        if (params.customCopy) {
          updatedCopy = {
            ...updatedCopy,
            caption: params.customCopy.caption !== undefined ? params.customCopy.caption : updatedCopy.caption,
            hashtags: params.customCopy.hashtags ? [...params.customCopy.hashtags] : updatedCopy.hashtags,
            cta: params.customCopy.cta !== undefined ? params.customCopy.cta : updatedCopy.cta,
            destinationUrl: params.customCopy.destinationUrl !== undefined ? params.customCopy.destinationUrl : updatedCopy.destinationUrl,
          };
        } else if (sourceVersion) {
          updatedCopy = { ...sourceVersion.copy, hashtags: [...sourceVersion.copy.hashtags] };
        }
      }

      if (params.syncCreative) {
        if (params.customAssets) {
          updatedAssets = [...params.customAssets];
        } else if (sourceVersion) {
          updatedAssets = [...sourceVersion.creativeAssets];
        }
      }

      if (params.syncScheduledDate) {
        if (params.customScheduledDate) {
          updatedDate = params.customScheduledDate;
        } else if (sourceVersion) {
          updatedDate = sourceVersion.scheduledDate;
        }
      }

      const newFingerprints = computeVersionFingerprints({
        copy: updatedCopy,
        creativeAssets: updatedAssets,
        scheduledDate: updatedDate,
      });

      const updatedVer: SubmissionVersion = {
        ...ver,
        copy: updatedCopy,
        creativeAssets: updatedAssets,
        scheduledDate: updatedDate,
        componentFingerprints: newFingerprints,
      };
      updatedVersions.push(updatedVer);

      const updatedItem: ContentItem = {
        ...item,
        deadlines: {
          ...item.deadlines,
          scheduledPublicationDate: params.syncScheduledDate && updatedDate ? updatedDate : item.deadlines.scheduledPublicationDate,
        },
      };
      updatedItems.push(updatedItem);

      // Selective approval invalidation for this sibling
      const componentsToReset: ApprovalComponentType[] = [];
      if (params.syncCopy) componentsToReset.push("copy");
      if (params.syncCreative) componentsToReset.push("creative");
      if (params.syncScheduledDate) componentsToReset.push("posting_date");

      for (const comp of componentsToReset) {
        for (const role of ["founder", "consultant"] as const) {
          resetDecisions.push({
            id: `dec_sync_${item.id}_${comp}_${role}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            projectId: item.projectId,
            contentItemId: item.id,
            submissionVersionId: ver.id,
            component: comp,
            componentFingerprint:
              comp === "copy"
                ? newFingerprints.copyFingerprint
                : comp === "creative"
                ? newFingerprints.creativeFingerprint
                : newFingerprints.postingDateFingerprint,
            reviewerUserId: params.actorUserId,
            reviewerRole: role,
            decision: "pending",
            decidedAt: now,
            note: `Selectively reset via Multi-Platform sync (${comp})`,
          });
        }
      }
    }

    const audit = createAuditEntry(
      group.projectId,
      params.actorUserId,
      "sync_content_group_fields",
      "content_group",
      group.id,
      `Synchronized selected fields across ${siblingItems.length} platform items in group '${group.title}'`,
      params.reason
    );

    setState((prev) => ({
      ...prev,
      submissionVersions: prev.submissionVersions.map((v) => {
        const match = updatedVersions.find((uv) => uv.id === v.id);
        return match || v;
      }),
      contentItems: prev.contentItems.map((i) => {
        const match = updatedItems.find((ui) => ui.id === i.id);
        return match || i;
      }),
      approvalDecisions: [...prev.approvalDecisions, ...resetDecisions],
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true, affectedItemCount: siblingItems.length };
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

  const updateContentItemStage = async (
    itemId: string,
    stage: ContentStage,
    actorUserId?: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { updateContentItemStageAction } = await import("../actions/content");
      const res = await updateContentItemStageAction({
        actorUserId,
        contentItemId: itemId,
        stage,
        reason,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to update workflow stage in database." };
      }

      setState((prev) => ({
        ...prev,
        contentItems: prev.contentItems.map((i) =>
          i.id === itemId
            ? {
                ...i,
                stage,
                publishedAt: stage === "published" ? new Date().toISOString() : i.publishedAt,
              }
            : i
        ),
      }));

      return { success: true };
    } catch (err: any) {
      console.error("Failed to update content item stage:", err);
      return { success: false, error: err.message || "Failed to persist workflow stage." };
    }
  };

  const assignContentItem = async (params: {
    projectId?: string;
    contentItemId: string;
    assigneeUserId: string;
    assignmentRole?: AssignmentRole;
    dueAt?: string;
    actorUserId: string;
    reason?: string;
  }): Promise<{ success: boolean; assignment?: ContentAssignment; error?: string }> => {
    try {
      const { assignContentItemAction } = await import("../actions/assignments");
      const res = await assignContentItemAction({
        actorUserId: params.actorUserId,
        projectId: params.projectId,
        contentItemId: params.contentItemId,
        assigneeUserId: params.assigneeUserId,
        assignmentRole: params.assignmentRole as any,
        dueAt: params.dueAt,
        reason: params.reason,
      });

      if (!res.success || !("assignment" in res) || !res.assignment) {
        const errorMsg = "error" in res ? res.error : "Failed to persist assignment to database.";
        return { success: false, error: errorMsg };
      }

      const dbAsgn = res.assignment;
      const canonicalAssignment: ContentAssignment = {
        id: dbAsgn.id,
        projectId: dbAsgn.projectId,
        contentItemId: dbAsgn.contentItemId,
        assigneeUserId: dbAsgn.assigneeUserId,
        assignmentRole: (dbAsgn.assignmentRole as any) || "designer",
        status: (dbAsgn.status as any) || "assigned",
        assignedByUserId: dbAsgn.assignedByUserId,
        assignedAt: dbAsgn.assignedAt ? new Date(dbAsgn.assignedAt).toISOString() : new Date().toISOString(),
        initialDueAt: dbAsgn.initialDueAt ? new Date(dbAsgn.initialDueAt).toISOString() : new Date().toISOString(),
        currentDueAt: dbAsgn.currentDueAt ? new Date(dbAsgn.currentDueAt).toISOString() : new Date().toISOString(),
        createdAt: dbAsgn.createdAt ? new Date(dbAsgn.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: dbAsgn.updatedAt ? new Date(dbAsgn.updatedAt).toISOString() : new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        contentAssignments: [
          ...prev.contentAssignments.filter((a) => a.contentItemId !== params.contentItemId || a.id === canonicalAssignment.id),
          canonicalAssignment,
        ],
        contentItems: prev.contentItems.map((i) =>
          i.id === params.contentItemId
            ? {
                ...i,
                accountableOwnerId: canonicalAssignment.assigneeUserId,
              }
            : i
        ),
      }));

      return { success: true, assignment: canonicalAssignment };
    } catch (err: any) {
      console.error("Failed to assign content item:", err);
      return { success: false, error: err.message || "Failed to persist assignment." };
    }
  };

  const acceptContentAssignment = (assignmentId: string, actorUserId: string): { success: boolean; error?: string } => {
    const assignment = state.contentAssignments.find((a) => a.id === assignmentId);
    if (!assignment) return { success: false, error: "Assignment not found" };
    if (assignment.assigneeUserId !== actorUserId) {
      return { success: false, error: "Unauthorized: You can only accept your own assignment" };
    }

    const now = new Date().toISOString();
    const audit = createAuditEntry(
      assignment.projectId,
      actorUserId,
      "accept_assignment",
      "content_assignment",
      assignmentId,
      `Accepted assignment for deliverable`
    );

    setState((prev) => ({
      ...prev,
      contentAssignments: prev.contentAssignments.map((a) =>
        a.id === assignmentId ? { ...a, status: "accepted", acceptedAt: now, updatedAt: now } : a
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const updateAssignmentDeadline = (params: {
    assignmentId: string;
    newDueAt: string;
    reason: string;
    actorUserId: string;
  }): { success: boolean; error?: string } => {
    const assignment = state.contentAssignments.find((a) => a.id === params.assignmentId);
    if (!assignment) return { success: false, error: "Assignment not found" };
    if (!params.reason.trim()) {
      return { success: false, error: "Mandatory reason required for deadline change" };
    }

    const now = new Date().toISOString();
    const historyEntry = {
      previousDueAt: assignment.currentDueAt,
      newDueAt: params.newDueAt,
      changedByUserId: params.actorUserId,
      changedAt: now,
      reason: params.reason.trim(),
    };

    const audit = createAuditEntry(
      assignment.projectId,
      params.actorUserId,
      "update_assignment_deadline",
      "content_assignment",
      params.assignmentId,
      `Updated deadline from ${assignment.currentDueAt} to ${params.newDueAt}`,
      params.reason
    );

    setState((prev) => ({
      ...prev,
      contentAssignments: prev.contentAssignments.map((a) =>
        a.id === params.assignmentId
          ? {
              ...a,
              currentDueAt: params.newDueAt,
              dueAtHistory: [...(a.dueAtHistory || []), historyEntry],
              updatedAt: now,
            }
          : a
      ),
      contentItems: prev.contentItems.map((i) =>
        i.id === assignment.contentItemId
          ? { ...i, deadlines: { ...i.deadlines, submissionDeadline: params.newDueAt } }
          : i
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  // --- TIME TRACKING & WORK SESSIONS (Phase 2) ---
  const startWorkSession = (params: {
    projectId: string;
    contentItemId: string;
    assignmentId: string;
    userId: string;
    notes?: string;
  }): { success: boolean; session?: WorkSession; error?: string; activeSession?: WorkSession } => {
    // 1. Concurrency Enforcement: Check if user already has an active session
    const existingActive = state.workSessions.find(
      (ws) => ws.userId === params.userId && ws.status === "active"
    );
    if (existingActive) {
      const activeItem = state.contentItems.find((i) => i.id === existingActive.contentItemId);
      return {
        success: false,
        error: `Active timer already running on '${activeItem?.title || "another item"}'. Please pause or stop it first.`,
        activeSession: existingActive,
      };
    }

    // 2. Validate Membership & Status
    const user = state.users.find((u) => u.id === params.userId);
    if (!user || user.status === "inactive") {
      return { success: false, error: "Inactive user cannot start a work session." };
    }

    const membership = state.projectMemberships.find(
      (m) => m.projectId === params.projectId && m.userId === params.userId && m.status === "active"
    );
    if (!membership) {
      return { success: false, error: "Unauthorized: User is not an active member of this project." };
    }

    // 3. Validate Assignment
    let assignment = state.contentAssignments.find((a) => a.id === params.assignmentId);
    if (!assignment) {
      assignment = state.contentAssignments.find(
        (a) => a.contentItemId === params.contentItemId && a.assigneeUserId === params.userId && a.status !== "reassigned"
      );
    }

    const item = state.contentItems.find((i) => i.id === params.contentItemId);
    const now = new Date().toISOString();

    if (!assignment && item && (item.accountableOwnerId === params.userId || item.collaboratorIds.includes(params.userId))) {
      const generatedAsgnId = params.assignmentId || ("asgn_" + Math.random().toString(36).substr(2, 9));
      assignment = {
        id: generatedAsgnId,
        projectId: params.projectId,
        contentItemId: params.contentItemId,
        assigneeUserId: params.userId,
        assignmentRole: "designer",
        status: "in_progress",
        assignedByUserId: params.userId,
        assignedAt: now,
        initialDueAt: item.deadlines.submissionDeadline || now,
        currentDueAt: item.deadlines.submissionDeadline || now,
        createdAt: now,
        updatedAt: now,
      };
    }

    if (!assignment) {
      return { success: false, error: "Assignment not found." };
    }
    if (assignment.assigneeUserId !== params.userId) {
      return { success: false, error: "Cannot start a work session on another team member's assignment." };
    }
    if (assignment.status === "reassigned") {
      return { success: false, error: "Cannot start timer on a reassigned historical task." };
    }

    const effectiveAssignmentId = assignment.id;
    const newSession: WorkSession = {
      id: "ws_" + Math.random().toString(36).substr(2, 9),
      projectId: params.projectId,
      contentItemId: params.contentItemId,
      assignmentId: effectiveAssignmentId,
      userId: params.userId,
      startedAt: now,
      accumulatedSeconds: 0,
      activeSegmentStartedAt: now,
      status: "active",
      adjustments: [],
      notes: params.notes,
      createdAt: now,
      updatedAt: now,
    };

    const audit = createAuditEntry(
      params.projectId,
      params.userId,
      "start_timer",
      "work_session",
      newSession.id,
      `Started work session timer for deliverable`
    );

    setState((prev) => {
      const existingAsgn = prev.contentAssignments.find((a) => a.id === effectiveAssignmentId);
      const updatedAssignments = existingAsgn
        ? prev.contentAssignments.map((a) =>
            a.id === effectiveAssignmentId
              ? {
                  ...a,
                  status: a.status === "assigned" || a.status === "accepted" ? "in_progress" : a.status,
                  startedAt: a.startedAt || now,
                  updatedAt: now,
                }
              : a
          )
        : [...prev.contentAssignments, assignment!];

      return {
        ...prev,
        workSessions: [...prev.workSessions, newSession],
        contentAssignments: updatedAssignments,
        auditRecords: [audit, ...prev.auditRecords],
      };
    });

    return { success: true, session: newSession };
  };

  const pauseWorkSession = (sessionId: string, actorUserId: string): { success: boolean; error?: string } => {
    const session = state.workSessions.find((ws) => ws.id === sessionId);
    if (!session) return { success: false, error: "Work session not found." };
    if (session.userId !== actorUserId) {
      return { success: false, error: "Unauthorized: You can only pause your own work session." };
    }
    if (session.status !== "active") {
      return { success: false, error: "Session is not currently active." };
    }

    const now = new Date().toISOString();
    const segmentDuration = session.activeSegmentStartedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(session.activeSegmentStartedAt)) / 1000))
      : 0;

    const newAccumulated = session.accumulatedSeconds + segmentDuration;

    const audit = createAuditEntry(
      session.projectId,
      actorUserId,
      "pause_timer",
      "work_session",
      sessionId,
      `Paused timer (accumulated: ${Math.round(newAccumulated / 60)} mins)`
    );

    setState((prev) => ({
      ...prev,
      workSessions: prev.workSessions.map((ws) =>
        ws.id === sessionId
          ? {
              ...ws,
              accumulatedSeconds: newAccumulated,
              activeSegmentStartedAt: null,
              status: "paused",
              updatedAt: now,
            }
          : ws
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const resumeWorkSession = (
    sessionId: string,
    actorUserId: string
  ): { success: boolean; error?: string; activeSession?: WorkSession } => {
    // Check concurrency
    const existingActive = state.workSessions.find(
      (ws) => ws.userId === actorUserId && ws.status === "active" && ws.id !== sessionId
    );
    if (existingActive) {
      const activeItem = state.contentItems.find((i) => i.id === existingActive.contentItemId);
      return {
        success: false,
        error: `Active timer already running on '${activeItem?.title || "another item"}'. Please pause or stop it first.`,
        activeSession: existingActive,
      };
    }

    const session = state.workSessions.find((ws) => ws.id === sessionId);
    if (!session) return { success: false, error: "Work session not found." };
    if (session.userId !== actorUserId) {
      return { success: false, error: "Unauthorized: You can only resume your own work session." };
    }
    if (session.status !== "paused") {
      return { success: false, error: "Session is not currently paused." };
    }

    const now = new Date().toISOString();
    const audit = createAuditEntry(
      session.projectId,
      actorUserId,
      "resume_timer",
      "work_session",
      sessionId,
      `Resumed work session timer`
    );

    setState((prev) => ({
      ...prev,
      workSessions: prev.workSessions.map((ws) =>
        ws.id === sessionId
          ? {
              ...ws,
              activeSegmentStartedAt: now,
              status: "active",
              updatedAt: now,
            }
          : ws
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const stopWorkSession = (
    sessionId: string,
    actorUserId: string,
    notes?: string
  ): { success: boolean; error?: string } => {
    const session = state.workSessions.find((ws) => ws.id === sessionId);
    if (!session) return { success: false, error: "Work session not found." };
    if (session.userId !== actorUserId) {
      return { success: false, error: "Unauthorized: You can only stop your own work session." };
    }

    const now = new Date().toISOString();
    let finalAccumulated = session.accumulatedSeconds;
    if (session.status === "active" && session.activeSegmentStartedAt) {
      finalAccumulated += Math.max(0, Math.floor((Date.now() - Date.parse(session.activeSegmentStartedAt)) / 1000));
    }

    const audit = createAuditEntry(
      session.projectId,
      actorUserId,
      "stop_timer",
      "work_session",
      sessionId,
      `Stopped work session timer (Total recorded: ${Math.round(finalAccumulated / 60)} mins)`
    );

    setState((prev) => ({
      ...prev,
      workSessions: prev.workSessions.map((ws) =>
        ws.id === sessionId
          ? {
              ...ws,
              accumulatedSeconds: finalAccumulated,
              activeSegmentStartedAt: null,
              status: "completed",
              endedAt: now,
              notes: notes || ws.notes,
              updatedAt: now,
            }
          : ws
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const adjustWorkSessionDuration = (params: {
    sessionId: string;
    adjustedDurationSeconds: number;
    reason: string;
    actorUserId: string;
  }): { success: boolean; adjustment?: WorkSessionAdjustment; error?: string } => {
    const session = state.workSessions.find((ws) => ws.id === params.sessionId);
    if (!session) return { success: false, error: "Work session not found." };
    if (!params.reason.trim()) {
      return { success: false, error: "Mandatory reason required for time tracking adjustment." };
    }

    const now = new Date().toISOString();
    const adjustment: WorkSessionAdjustment = {
      id: "adj_" + Math.random().toString(36).substr(2, 9),
      workSessionId: params.sessionId,
      previousDurationSeconds: session.accumulatedSeconds,
      adjustedDurationSeconds: params.adjustedDurationSeconds,
      reason: params.reason.trim(),
      adjustedByUserId: params.actorUserId,
      adjustedAt: now,
    };

    const audit = createAuditEntry(
      session.projectId,
      params.actorUserId,
      "adjust_timer_duration",
      "work_session",
      params.sessionId,
      `Adjusted session duration from ${session.accumulatedSeconds}s to ${params.adjustedDurationSeconds}s`,
      params.reason
    );

    setState((prev) => ({
      ...prev,
      workSessions: prev.workSessions.map((ws) =>
        ws.id === params.sessionId
          ? {
              ...ws,
              accumulatedSeconds: params.adjustedDurationSeconds,
              adjustments: [...(ws.adjustments || []), adjustment],
              updatedAt: now,
            }
          : ws
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true, adjustment };
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

      const now = new Date().toISOString();
      const frozenVersion: SubmissionVersion = {
        ...version,
        isDraft: false,
        submittedAt: now,
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
        createdAt: now,
      };

      return {
        ...prev,
        submissionVersions: prev.submissionVersions.map((v) => (v.id === versionId ? frozenVersion : v)),
        contentAssignments: prev.contentAssignments.map((a) => {
          if (a.contentItemId === item.id && (a.status === "assigned" || a.status === "accepted" || a.status === "in_progress")) {
            return {
              ...a,
              status: "submitted" as const,
              firstSubmittedAt: a.firstSubmittedAt || (version.versionNumber === 1 ? now : undefined),
              updatedAt: now,
            };
          }
          return a;
        }),
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

    const notifDesigner: Notification = {
      id: "notif_" + Math.random().toString(36).substr(2, 9),
      projectId: reqData.projectId,
      recipientUserId: "u_designer1",
      eventType: "changes_requested",
      entityType: "content_item",
      entityId: reqData.contentItemId,
      title: `Changes Requested on ${reqData.component.toUpperCase()}`,
      message: `${reqData.reviewerName} requested changes: "${reqData.requestedChange}"`,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      changeRequests: [...prev.changeRequests, newReq],
      contentItems: prev.contentItems.map((i) =>
        i.id === reqData.contentItemId ? { ...i, stage: "changes_requested" } : i
      ),
      notifications: [notifDesigner, ...prev.notifications],
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
    submissionVersionId?: string;
    liveUrl: string;
    publishedAt?: string;
    actorUserId: string;
    externalEditOccurred?: boolean;
    externalEditNote?: string;
  }) => {
    setState((prev) => {
      const item = prev.contentItems.find((i) => i.id === params.contentItemId);
      if (!item) return prev;

      const effectiveVersionId = params.submissionVersionId || item.latestSubmittedVersionId || item.activeDraftVersionId || "ver_v1";
      const canonicalPublishedAt = params.publishedAt || new Date().toISOString();

      const pubRec: PublicationRecord = {
        id: "pub_" + Math.random().toString(36).substr(2, 9),
        projectId: item.projectId,
        contentItemId: params.contentItemId,
        submissionVersionId: effectiveVersionId,
        liveUrl: params.liveUrl,
        publishedAt: canonicalPublishedAt,
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
        `Marked '${item.title}' as PUBLISHED at ${params.liveUrl} (Canonical Published Date: ${canonicalPublishedAt})`
      );

      return {
        ...prev,
        publicationRecords: [...prev.publicationRecords, pubRec],
        contentItems: prev.contentItems.map((i) =>
          i.id === item.id
            ? {
                ...i,
                stage: "published",
                publishedAt: canonicalPublishedAt,
                liveUrl: params.liveUrl,
                publishedByUserId: params.actorUserId,
              }
            : i
        ),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });
  };

  const updatePublicationDetails = async (params: {
    contentItemId: string;
    publishedAt?: string;
    liveUrl?: string;
    reason: string;
    actorUserId: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const actor = state.users.find((u) => u.id === params.actorUserId);
    if (actor && (actor.role === "designer" || actor.role === "client")) {
      return { success: false, error: "Unauthorized: Designers and Clients cannot modify publication details." };
    }

    const item = state.contentItems.find((i) => i.id === params.contentItemId);
    if (!item) return { success: false, error: "Content item not found" };
    if (!params.reason.trim()) {
      return { success: false, error: "Mandatory reason required to update publication details." };
    }

    try {
      const { updatePublicationDetailsAction } = await import("../actions/content");
      const res = await updatePublicationDetailsAction({
        actorUserId: params.actorUserId,
        contentItemId: params.contentItemId,
        publishedAt: params.publishedAt || new Date().toISOString(),
        liveUrl: params.liveUrl,
        reason: params.reason,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to update publication details in database." };
      }

      const oldPublishedAt = item.publishedAt;
      const oldLiveUrl = item.liveUrl;

      const audit = createAuditEntry(
        item.projectId,
        params.actorUserId,
        "update_publication_details",
        "content_item",
        item.id,
        `Updated publication details: publishedAt (${oldPublishedAt || "none"} -> ${params.publishedAt || oldPublishedAt}), liveUrl (${oldLiveUrl || "none"} -> ${params.liveUrl || oldLiveUrl})`,
        params.reason,
        { publishedAt: oldPublishedAt, liveUrl: oldLiveUrl },
        { publishedAt: params.publishedAt, liveUrl: params.liveUrl }
      );

      setState((prev) => ({
        ...prev,
        contentItems: prev.contentItems.map((i) =>
          i.id === item.id
            ? {
                ...i,
                publishedAt: params.publishedAt !== undefined ? params.publishedAt : i.publishedAt,
                liveUrl: params.liveUrl !== undefined ? params.liveUrl : i.liveUrl,
              }
            : i
        ),
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true };
    } catch (err: any) {
      console.error("Failed to update publication details:", err);
      return { success: false, error: err.message || "Failed to update publication details." };
    }
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
  const createScript = async (scriptData: Omit<Script, "id" | "updatedAt">): Promise<Script> => {
    try {
      const { createScriptAction } = await import("../actions/scripts");
      const res = await createScriptAction({
        projectId: scriptData.projectId,
        title: scriptData.title,
        platform: scriptData.platform,
        linkedContentItemId: scriptData.linkedContentItemId,
        hook: scriptData.hook,
        scenes: scriptData.scenes,
        cta: scriptData.cta,
        notes: scriptData.notes,
      });

      if (res.success && res.script) {
        const createdScript = res.script;
        setState((prev) => ({
          ...prev,
          scripts: [...prev.scripts.filter((s) => s.id !== createdScript.id), createdScript],
        }));
        return createdScript;
      }
    } catch (err) {
      console.error("Failed to persist script to DB:", err);
    }

    const fallbackScript: Script = {
      ...scriptData,
      id: "scr_" + Math.random().toString(36).substr(2, 9),
      updatedAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      scripts: [...prev.scripts, fallbackScript],
    }));
    return fallbackScript;
  };

  const updateScript = async (scriptId: string, updates: Partial<Script>): Promise<void> => {
    try {
      const { updateScriptAction } = await import("../actions/scripts");
      await updateScriptAction({
        scriptId,
        title: updates.title,
        platform: updates.platform,
        linkedContentItemId: updates.linkedContentItemId,
        hook: updates.hook,
        scenes: updates.scenes,
        cta: updates.cta,
        notes: updates.notes,
        status: updates.status,
      });
    } catch (err) {
      console.error("Failed to update script in DB:", err);
    }

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

  const linkScriptToContent = async (scriptId: string, contentItemId: string): Promise<void> => {
    await updateScript(scriptId, { linkedContentItemId: contentItemId, status: "linked" });
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
  const updateDeadline = async (params: {
    contentItemId: string;
    kind: "submission" | "resubmission" | "approval_target" | "scheduled_publication";
    newDueAt: string;
    changedByUserId: string;
    reason: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const actor = state.users.find((u) => u.id === params.changedByUserId);
    if (actor && actor.role === "designer" && params.kind === "scheduled_publication") {
      return { success: false, error: "Unauthorized: Designers cannot modify scheduled publication dates." };
    }

    const item = state.contentItems.find((i) => i.id === params.contentItemId);
    if (!item) return { success: false, error: "Content item not found" };

    try {
      const { updateDeadlineAction } = await import("../actions/content");
      const res = await updateDeadlineAction({
        actorUserId: params.changedByUserId,
        contentItemId: params.contentItemId,
        kind: params.kind,
        newDueAt: params.newDueAt,
        reason: params.reason,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to update deadline in database." };
      }

      const newRec: DeadlineRecord = {
        id: (res as any).recordId || ("dl_" + Math.random().toString(36).substr(2, 9)),
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

      setState((prev) => ({
        ...prev,
        deadlineRecords: [...prev.deadlineRecords, newRec],
        contentItems: prev.contentItems.map((i) =>
          i.id === item.id ? { ...i, deadlines: updatedDeadlines } : i
        ),
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true };
    } catch (err: any) {
      console.error("Failed to update deadline:", err);
      return { success: false, error: err.message || "Failed to update deadline." };
    }
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
    const actor = state.users.find((u) => u.id === params.createdByUserId);
    if (actor && (actor.role === "designer" || actor.role === "client")) {
      throw new Error("Unauthorized: Designers and Clients cannot generate external review links.");
    }

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

  // --- TEAM MANAGEMENT & MEMBERSHIPS (Phase 1) ---
  const createTeamMember = async (data: {
    id?: string;
    name: string;
    email: string;
    role: UserRole;
    jobTitle?: string;
    workingHoursPerDay?: number;
    actorUserId: string;
  }): Promise<{ success: boolean; user?: User; error?: string }> => {
    const existing = state.users.find(
      (u) => u.email.toLowerCase() === data.email.trim().toLowerCase()
    );
    if (existing) {
      return { success: false, error: `A team member with email '${data.email}' already exists.` };
    }

    try {
      const { createTeamMemberAction } = await import("../actions/team");
      const res = await createTeamMemberAction({
        fullName: data.name,
        email: data.email,
        role: data.role as any,
        actorUserId: data.actorUserId,
      });

      if (!res.success || !res.user) {
        return { success: false, error: res.error || "Failed to create team member in database." };
      }

      const canonicalUser: User = {
        id: res.user.id,
        name: res.user.fullName || data.name.trim(),
        email: res.user.email || data.email.trim().toLowerCase(),
        avatar: data.name.trim().split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "U",
        role: (res.user.organizationRole as any) || data.role,
        jobTitle: data.jobTitle?.trim() || undefined,
        status: "active",
        workingHoursPerDay: data.workingHoursPerDay || 8,
        dateJoined: res.user.createdAt ? new Date(res.user.createdAt).toISOString() : new Date().toISOString(),
        createdByUserId: data.actorUserId,
        createdAt: res.user.createdAt ? new Date(res.user.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const audit = createAuditEntry(
        "proj_internal",
        data.actorUserId,
        "create_user",
        "user",
        canonicalUser.id,
        `Created team member '${canonicalUser.name}' (${canonicalUser.email}) with role '${canonicalUser.role}'`
      );

      setState((prev) => ({
        ...prev,
        users: [...prev.users.filter((u) => u.id !== canonicalUser.id), canonicalUser],
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, user: canonicalUser };
    } catch (err: any) {
      console.error("Failed to create team member:", err);
      return { success: false, error: err.message || "Failed to create team member." };
    }
  };

  const updateTeamMember = (
    userId: string,
    updates: Partial<Pick<User, "name" | "email" | "role" | "jobTitle" | "workingHoursPerDay">>,
    actorUserId: string
  ): { success: boolean; error?: string } => {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return { success: false, error: "Team member not found." };

    const audit = createAuditEntry(
      "proj_internal",
      actorUserId,
      "update_user",
      "user",
      userId,
      `Updated profile for team member '${user.name}'`
    );

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === userId
          ? {
              ...u,
              ...updates,
              avatar: updates.name
                ? updates.name.trim().split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                : u.avatar,
              updatedAt: new Date().toISOString(),
            }
          : u
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const updateTeamMemberStatus = (
    userId: string,
    newStatus: "active" | "inactive",
    actorUserId: string,
    reason?: string
  ): { success: boolean; error?: string } => {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return { success: false, error: "Team member not found." };

    const audit = createAuditEntry(
      "proj_internal",
      actorUserId,
      newStatus === "inactive" ? "inactivate_user" : "reactivate_user",
      "user",
      userId,
      `${newStatus === "inactive" ? "Inactivated" : "Reactivated"} team member '${user.name}' (${user.email}). All historical records preserved.`,
      reason
    );

    setState((prev) => {
      const now = new Date().toISOString();
      return {
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId ? { ...u, status: newStatus, updatedAt: now } : u
        ),
        // If inactivating, also mark active project memberships as inactive
        projectMemberships: prev.projectMemberships.map((m) =>
          m.userId === userId && newStatus === "inactive"
            ? { ...m, status: "inactive", removedAt: now }
            : m
        ),
        auditRecords: [audit, ...prev.auditRecords],
      };
    });

    return { success: true };
  };

  const permanentlyDeleteTeamMember = async (
    userId: string,
    actorUserId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return { success: false, error: "Team member not found." };

    const actor = state.users.find((u) => u.id === actorUserId);
    if (actor && actor.role !== "founder" && actor.role !== "admin") {
      return {
        success: false,
        error: "Unauthorized: Only Founders and Admins can permanently delete team members.",
      };
    }

    if (actorUserId === userId) {
      return {
        success: false,
        error: "You cannot delete your own active account while logged in.",
      };
    }

    if (user.role === "founder") {
      const activeFounders = state.users.filter(
        (u) => u.role === "founder" && u.status !== "deleted" && u.id !== userId
      );
      if (activeFounders.length === 0) {
        return {
          success: false,
          error: "Cannot delete the last active Founder of the organization.",
        };
      }
    }

    try {
      const { permanentlyDeleteTeamMemberAction } = await import("../actions/team");
      const res = await permanentlyDeleteTeamMemberAction({
        userId,
        actorUserId,
        reason,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to delete team member from database." };
      }

      const now = new Date().toISOString();
      const audit = createAuditEntry(
        "proj_internal",
        actorUserId,
        "permanent_delete_user",
        "user",
        userId,
        `Permanently deleted user '${user.name}' (${user.email}). Account tombstoned and historical references anonymized.`,
        reason
      );

      setState((prev) => ({
        ...prev,
        users: prev.users.filter((u) => u.id !== userId),
        projectMemberships: prev.projectMemberships.map((m) =>
          m.userId === userId ? { ...m, status: "inactive", removedAt: now } : m
        ),
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true };
    } catch (err: any) {
      console.error("[AppStateContext] Permanent deletion error:", err);
      return { success: false, error: err.message || "Failed to permanently delete team member." };
    }
  };

  const addProjectMember = async (params: {
    projectId: string;
    userId: string;
    membershipRole?: UserRole;
    actorUserId: string;
  }): Promise<{ success: boolean; membership?: ProjectMembership; error?: string }> => {
    const user = state.users.find((u) => u.id === params.userId);
    if (!user) return { success: false, error: "User not found." };
    if (user.status === "inactive") {
      return { success: false, error: "Cannot assign inactive user to a project. Reactivate account first." };
    }

    try {
      const { addProjectMemberAction } = await import("../actions/projects");
      const res = await addProjectMemberAction({
        projectId: params.projectId,
        userId: params.userId,
        membershipRole: params.membershipRole,
        actorUserId: params.actorUserId,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to add project member in database." };
      }

      const now = new Date().toISOString();
      const existingMembership = state.projectMemberships.find(
        (m) => m.projectId === params.projectId && m.userId === params.userId
      );

      let updatedMembership: ProjectMembership;
      if (existingMembership) {
        updatedMembership = {
          ...existingMembership,
          id: (res as any).membershipId || existingMembership.id,
          status: "active",
          membershipRole: params.membershipRole || existingMembership.membershipRole || user.role,
          removedAt: undefined,
        };
      } else {
        updatedMembership = {
          id: (res as any).membershipId || ("mem_" + Math.random().toString(36).substr(2, 9)),
          projectId: params.projectId,
          userId: params.userId,
          status: "active",
          membershipRole: params.membershipRole || user.role,
          addedByUserId: params.actorUserId,
          addedAt: now,
        };
      }

      const audit = createAuditEntry(
        params.projectId,
        params.actorUserId,
        "add_project_member",
        "project_membership",
        updatedMembership.id,
        `Added/reactivated member '${user.name}' (${user.email}) in project '${params.projectId}'`
      );

      setState((prev) => ({
        ...prev,
        projectMemberships: [
          ...prev.projectMemberships.filter(
            (m) => !(m.projectId === params.projectId && m.userId === params.userId)
          ),
          updatedMembership,
        ],
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, membership: updatedMembership };
    } catch (err: any) {
      console.error("Failed to add project member:", err);
      return { success: false, error: err.message || "Failed to add project member." };
    }
  };

  const removeProjectMember = async (
    membershipId: string,
    actorUserId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const membership = state.projectMemberships.find((m) => m.id === membershipId);
    if (!membership) return { success: false, error: "Membership record not found." };

    const user = state.users.find((u) => u.id === membership.userId);
    const now = new Date().toISOString();

    try {
      const { removeProjectMemberAction } = await import("../actions/projects");
      const res = await removeProjectMemberAction({
        projectId: membership.projectId,
        userId: membership.userId,
        actorUserId,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to remove project member from database." };
      }

      const audit = createAuditEntry(
        membership.projectId,
        actorUserId,
        "remove_project_member",
        "project_membership",
        membershipId,
        `Removed member '${user?.name || membership.userId}' from project membership`,
        reason
      );

      setState((prev) => ({
        ...prev,
        projectMemberships: prev.projectMemberships.map((m) =>
          m.id === membershipId ? { ...m, status: "inactive", removedAt: now } : m
        ),
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true };
    } catch (err: any) {
      console.error("Failed to remove project member:", err);
      return { success: false, error: err.message || "Failed to remove project member." };
    }
  };

  // --- ATTENDANCE & DAILY PRESENCE (Phase 2.1) ---
  const getKolkataDateString = (d: Date = new Date()): string => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };

  const checkInAttendance = async (userId: string): Promise<{ success: boolean; record?: AttendanceRecord; error?: string }> => {
    const user = state.users.find((u) => u.id === userId);
    if (!user || user.status === "inactive") {
      return { success: false, error: "Inactive or nonexistent user cannot check in." };
    }

    try {
      const { checkInAction } = await import("../actions/attendance");
      const res = await checkInAction({ actorUserId: userId });

      if (!res.success || !res.record) {
        return { success: false, error: res.error || "Failed to check in." };
      }

      const todayDate = getKolkataDateString();
      const canonicalRecord: AttendanceRecord = {
        id: res.record.id,
        userId: res.record.userId,
        attendanceDate: res.record.attendanceDate,
        checkedInAt: res.record.checkedInAt.toISOString(),
        checkedOutAt: res.record.checkedOutAt ? res.record.checkedOutAt.toISOString() : undefined,
        status: (res.record.status as any) || "checked_in",
        corrections: [],
        createdAt: res.record.createdAt.toISOString(),
        updatedAt: res.record.updatedAt.toISOString(),
      };

      const audit = createAuditEntry(
        "org_ace_assured",
        userId,
        "check_in_attendance",
        "attendance_record",
        canonicalRecord.id,
        `User '${user.name}' checked in for daily attendance on ${todayDate}`
      );

      setState((prev) => ({
        ...prev,
        attendanceRecords: [
          ...prev.attendanceRecords.filter((r) => r.id !== canonicalRecord.id),
          canonicalRecord,
        ],
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, record: canonicalRecord };
    } catch (err: any) {
      console.error("Failed to check in:", err);
      return { success: false, error: err.message || "Failed to check in." };
    }
  };

  const checkOutAttendance = async (userId: string): Promise<{ success: boolean; record?: AttendanceRecord; error?: string }> => {
    const user = state.users.find((u) => u.id === userId);
    if (!user) {
      return { success: false, error: "User not found." };
    }

    try {
      const { checkOutAction } = await import("../actions/attendance");
      const res = await checkOutAction({ actorUserId: userId });

      if (!res.success || !res.record) {
        return { success: false, error: res.error || "Failed to check out." };
      }

      const now = new Date().toISOString();
      const canonicalRecord: AttendanceRecord = {
        id: res.record.id,
        userId: res.record.userId,
        attendanceDate: res.record.attendanceDate,
        checkedInAt: res.record.checkedInAt.toISOString(),
        checkedOutAt: res.record.checkedOutAt ? res.record.checkedOutAt.toISOString() : now,
        status: "checked_out",
        corrections: [],
        createdAt: res.record.createdAt.toISOString(),
        updatedAt: res.record.updatedAt.toISOString(),
      };

      const audit = createAuditEntry(
        "org_ace_assured",
        userId,
        "check_out_attendance",
        "attendance_record",
        canonicalRecord.id,
        `User '${user?.name || userId}' checked out at ${new Date(now).toLocaleTimeString()}`
      );

      setState((prev) => ({
        ...prev,
        attendanceRecords: prev.attendanceRecords.map((r) => (r.id === canonicalRecord.id ? canonicalRecord : r)),
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, record: canonicalRecord };
    } catch (err: any) {
      console.error("Failed to check out:", err);
      return { success: false, error: err.message || "Failed to check out." };
    }
  };

  const adjustAttendance = async (params: {
    attendanceId: string;
    checkedInAt?: string;
    checkedOutAt?: string;
    reason: string;
    actorUserId: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const record = state.attendanceRecords.find((r) => r.id === params.attendanceId);
    if (!record) return { success: false, error: "Attendance record not found." };
    if (!params.reason.trim()) {
      return { success: false, error: "Mandatory reason required for attendance adjustment." };
    }

    const now = new Date().toISOString();
    const correction: AttendanceCorrection = {
      id: "att_corr_" + Math.random().toString(36).substr(2, 9),
      previousCheckIn: record.checkedInAt,
      newCheckIn: params.checkedInAt,
      previousCheckOut: record.checkedOutAt,
      newCheckOut: params.checkedOutAt,
      changedByUserId: params.actorUserId,
      reason: params.reason.trim(),
      createdAt: now,
    };

    const updatedRecord: AttendanceRecord = {
      ...record,
      checkedInAt: params.checkedInAt || record.checkedInAt,
      checkedOutAt: params.checkedOutAt !== undefined ? params.checkedOutAt : record.checkedOutAt,
      corrections: [...(record.corrections || []), correction],
      updatedAt: now,
    };

    const audit = createAuditEntry(
      "org_ace_assured",
      params.actorUserId,
      "adjust_attendance",
      "attendance_record",
      record.id,
      `Adjusted attendance record for user ${record.userId} on ${record.attendanceDate}`,
      params.reason
    );

    setState((prev) => ({
      ...prev,
      attendanceRecords: prev.attendanceRecords.map((r) => (r.id === record.id ? updatedRecord : r)),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  // --- CLIENT PORTAL & VISIBILITY (Phase 5) ---
  const setClientVisibility = (params: {
    contentItemId: string;
    clientVisible: boolean;
    actorUserId: string;
    reason?: string;
  }): { success: boolean; error?: string } => {
    const item = state.contentItems.find((i) => i.id === params.contentItemId);
    if (!item) return { success: false, error: "Content item not found." };

    const updatedItem: ContentItem = {
      ...item,
      clientVisible: params.clientVisible,
    };

    const audit = createAuditEntry(
      item.projectId,
      params.actorUserId,
      "update_client_visibility",
      "content_item",
      item.id,
      `Set client visibility to ${params.clientVisible ? "ON" : "OFF"} for '${item.title}'`,
      params.reason
    );

    setState((prev) => ({
      ...prev,
      contentItems: prev.contentItems.map((i) => (i.id === item.id ? updatedItem : i)),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const updateProjectClientAnalyticsConfig = (params: {
    projectId: string;
    allowedMetricKeys: string[];
    actorUserId: string;
  }): { success: boolean; error?: string } => {
    const project = state.projects.find((p) => p.id === params.projectId);
    if (!project) return { success: false, error: "Project not found." };

    const updatedProject: Project = {
      ...project,
      clientAnalyticsConfig: {
        allowedMetricKeys: params.allowedMetricKeys,
      },
    };

    const audit = createAuditEntry(
      project.id,
      params.actorUserId,
      "update_client_analytics_config",
      "project",
      project.id,
      `Updated client analytics metric whitelist: [${params.allowedMetricKeys.join(", ")}]`
    );

    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === project.id ? updatedProject : p)),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const addClientToProject = async (params: {
    name: string;
    email: string;
    jobTitle?: string;
    phone?: string;
    projectId: string;
    actorUserId: string;
  }): Promise<{ success: boolean; user?: User; membership?: ProjectMembership; error?: string }> => {
    // 1. Permission check
    const actorUser = state.users.find((u) => u.id === params.actorUserId);
    if (!actorUser) return { success: false, error: "Actor user not found." };

    if (actorUser.role === "designer" || actorUser.role === "client") {
      return {
        success: false,
        error: "Unauthorized: Designers and Clients cannot manage Client accounts.",
      };
    }

    if (actorUser.role === "consultant") {
      const hasMembership = state.projectMemberships.some(
        (m) => m.projectId === params.projectId && m.userId === params.actorUserId && m.status === "active"
      );
      if (!hasMembership) {
        return {
          success: false,
          error: "Unauthorized: Consultants can only manage client access for assigned projects.",
        };
      }
    }

    const project = state.projects.find((p) => p.id === params.projectId);
    if (!project) return { success: false, error: "Project not found." };

    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim();

    if (!cleanEmail || !cleanName) {
      return { success: false, error: "Name and Email are required." };
    }

    // 2. Email collision check with internal team members
    const existingUser = state.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existingUser && existingUser.role !== "client") {
      return {
        success: false,
        error: `This email (${params.email}) is already registered as an internal team member (${existingUser.role}). Internal employee accounts cannot be added as clients.`,
      };
    }

    try {
      const { addClientToProjectAction } = await import("../actions/clients");
      const res = await addClientToProjectAction({
        name: cleanName,
        email: cleanEmail,
        jobTitle: params.jobTitle,
        phone: params.phone,
        projectId: params.projectId,
        actorUserId: params.actorUserId,
      });

      if (!res.success) {
        return { success: false, error: res.error || "Failed to grant client access in database." };
      }

      const now = new Date().toISOString();
      const clientUser: User = {
        id: (res as any).userId || (existingUser ? existingUser.id : ("u_client_" + Math.random().toString(36).substr(2, 9))),
        name: cleanName,
        email: cleanEmail,
        avatar: cleanName.charAt(0).toUpperCase() || "C",
        role: "client",
        jobTitle: params.jobTitle?.trim() || "Client Contact",
        status: "active",
        dateJoined: now.split("T")[0],
        createdByUserId: params.actorUserId,
        createdAt: now,
        updatedAt: now,
      };

      const membership: ProjectMembership = {
        id: (res as any).membershipId || ("pm_" + Math.random().toString(36).substr(2, 9)),
        projectId: params.projectId,
        userId: clientUser.id,
        status: "active",
        membershipRole: "client",
        addedByUserId: params.actorUserId,
        addedAt: now,
      };

      const audit = createAuditEntry(
        params.projectId,
        params.actorUserId,
        existingUser ? "add_existing_client_access" : "create_client_access",
        "project_membership",
        membership.id,
        `Granted Client Portal access for '${clientUser.name}' (${clientUser.email}) on project '${project.name}'`
      );

      setState((prev) => ({
        ...prev,
        users: [...prev.users.filter((u) => u.id !== clientUser.id), clientUser],
        projectMemberships: [
          ...prev.projectMemberships.filter(
            (m) => !(m.projectId === params.projectId && m.userId === clientUser.id)
          ),
          membership,
        ],
        auditRecords: [audit, ...prev.auditRecords],
      }));

      return { success: true, user: clientUser, membership };
    } catch (err: any) {
      console.error("[AppStateContext] Failed to sync client to database:", err);
      return { success: false, error: err.message || "Failed to add client to project." };
    }
  };

  const createClientUserAndAssign = (params: {
    name: string;
    email: string;
    projectId: string;
    actorUserId: string;
  }) => {
    return addClientToProject(params);
  };

  const revokeClientAccess = (params: {
    projectId: string;
    userId: string;
    actorUserId: string;
    reason?: string;
  }): { success: boolean; error?: string } => {
    const actorUser = state.users.find((u) => u.id === params.actorUserId);
    if (!actorUser) return { success: false, error: "Actor user not found." };

    if (actorUser.role === "designer" || actorUser.role === "client") {
      return {
        success: false,
        error: "Unauthorized: Designers and Clients cannot revoke client access.",
      };
    }

    if (actorUser.role === "consultant") {
      const hasMembership = state.projectMemberships.some(
        (m) => m.projectId === params.projectId && m.userId === params.actorUserId && m.status === "active"
      );
      if (!hasMembership) {
        return {
          success: false,
          error: "Unauthorized: Consultants can only manage client access for assigned projects.",
        };
      }
    }

    const membership = state.projectMemberships.find(
      (m) => m.projectId === params.projectId && m.userId === params.userId && m.status === "active"
    );
    if (!membership) {
      return { success: false, error: "Active client project membership not found." };
    }

    const clientUser = state.users.find((u) => u.id === params.userId);
    const now = new Date().toISOString();

    const updatedMembership: ProjectMembership = {
      ...membership,
      status: "inactive",
      removedAt: now,
    };

    const audit = createAuditEntry(
      params.projectId,
      params.actorUserId,
      "revoke_client_access",
      "project_membership",
      membership.id,
      `Revoked Client Portal access for '${clientUser?.name || params.userId}'`,
      params.reason
    );

    setState((prev) => ({
      ...prev,
      projectMemberships: prev.projectMemberships.map((m) =>
        m.id === membership.id ? updatedMembership : m
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
  };

  const reactivateClientAccess = (params: {
    projectId: string;
    userId: string;
    actorUserId: string;
  }): { success: boolean; error?: string } => {
    const actorUser = state.users.find((u) => u.id === params.actorUserId);
    if (!actorUser) return { success: false, error: "Actor user not found." };

    if (actorUser.role === "designer" || actorUser.role === "client") {
      return {
        success: false,
        error: "Unauthorized: Designers and Clients cannot manage client access.",
      };
    }

    if (actorUser.role === "consultant") {
      const hasMembership = state.projectMemberships.some(
        (m) => m.projectId === params.projectId && m.userId === params.actorUserId && m.status === "active"
      );
      if (!hasMembership) {
        return {
          success: false,
          error: "Unauthorized: Consultants can only manage client access for assigned projects.",
        };
      }
    }

    const membership = state.projectMemberships.find(
      (m) => m.projectId === params.projectId && m.userId === params.userId
    );
    if (!membership) {
      return { success: false, error: "Client project membership not found." };
    }

    const clientUser = state.users.find((u) => u.id === params.userId);
    const now = new Date().toISOString();

    const updatedMembership: ProjectMembership = {
      ...membership,
      status: "active",
      addedByUserId: params.actorUserId,
      addedAt: now,
      removedAt: undefined,
    };

    const audit = createAuditEntry(
      params.projectId,
      params.actorUserId,
      "reactivate_client_access",
      "project_membership",
      membership.id,
      `Reactivated Client Portal access for '${clientUser?.name || params.userId}'`
    );

    setState((prev) => ({
      ...prev,
      projectMemberships: prev.projectMemberships.map((m) =>
        m.id === membership.id ? updatedMembership : m
      ),
      auditRecords: [audit, ...prev.auditRecords],
    }));

    return { success: true };
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
        hydrateServerState,
        hydrateLayoutContext,
        createProject,
        updateProjectObjective,
        archiveProject,
        restoreProject,
        createCampaign,
        createContentGroupWithItems,
        syncContentGroupFields,
        createContentItem,
        updateContentItem,
        updateContentItemStage,
        assignContentItem,
        acceptContentAssignment,
        updateAssignmentDeadline,
        startWorkSession,
        pauseWorkSession,
        resumeWorkSession,
        stopWorkSession,
        adjustWorkSessionDuration,
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
        updatePublicationDetails,
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
        createTeamMember,
        updateTeamMember,
        updateTeamMemberStatus,
        permanentlyDeleteTeamMember,
        addProjectMember,
        removeProjectMember,
        generateExternalReviewLink,
        revokeExternalReviewLink,
        checkInAttendance,
        checkOutAttendance,
        adjustAttendance,
        setClientVisibility,
        updateProjectClientAnalyticsConfig,
        addClientToProject,
        createClientUserAndAssign,
        revokeClientAccess,
        reactivateClientAccess,
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
