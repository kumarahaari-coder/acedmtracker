"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Lock,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Upload,
  User,
  Users,
  X,
  Loader2,
} from "lucide-react";
import { generateExternalReviewTokenAction } from "@/lib/actions/collaboration";
import { DeleteDeliverableModal } from "@/components/content/DeleteDeliverableModal";
import {
  saveDraftVersionAction,
  submitVersionAction,
  createNewVersionDraftAction,
  toggleClientVisibilityAction,
  updateInternalDeadlineAction,
  getSubmissionEligibilityAction,
  syncContentGroupFieldsAction,
} from "@/lib/actions/content";
import {
  requestCreativeAssetUploadAction,
  confirmCreativeAssetUploadAction,
  removeCreativeAssetFromSubmissionAction,
  attachExternalAssetAction,
} from "@/lib/actions/assets";
import {
  getAuthoritativeContentItemDetailAction,
  ContentItemDetailDTO,
} from "@/lib/actions/contentDetail";
import {
  recordApprovalDecisionAction,
  recordFounderOverrideAction,
  revokeApprovalDecisionAction,
} from "@/lib/actions/approvals";
import {
  startWorkSessionAction,
  pauseWorkSessionAction,
  resumeWorkSessionAction,
  stopWorkSessionAction,
} from "@/lib/actions/timers";
import {
  createChangeRequestAction,
  respondToChangeRequestAction,
} from "@/lib/actions/changes";
import {
  ApprovalComponentType,
  ComponentDecision,
  ContentItem,
  SubmissionVersion,
  ContentAssignment,
  WorkSession,
  WorkSessionAdjustment,
  AssignmentRole,
  ContentGroup,
} from "@/lib/types";
import {
  getItemApprovalMatrixSummary,
  getComponentApprovalSummary,
} from "@/lib/derived";
import { formatDate, formatTime, formatDateTime } from "@/lib/formatters";
import { SafeImage } from "@/components/ui/SafeImage";
import { UserAvatar } from "@/components/ui/UserAvatar";

export default function ContentItemWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || "";
  const itemId = (params?.itemId as string) || "";

  const {
    state,
    recordApprovalDecision,
    recordFounderOverride,
    revokeApprovalDecision,
    createChangeRequest,
    respondToChangeRequest,
    resolveChangeRequest,
    createDraftVersion,
    updateDraftVersion,
    resubmitItemVersion,
    addComment,
    assignContentItem,
    updateAssignmentDeadline,
    startWorkSession,
    pauseWorkSession,
    resumeWorkSession,
    stopWorkSession,
    adjustWorkSessionDuration,
    syncContentGroupFields,
    markPublished,
    updatePublicationDetails,
    generateExternalReviewLink,
    setClientVisibility,
  } = useAppState();

  const {
    activeRole,
    activeUserId,
    canApprove,
    canOverride,
    canRespondToChanges,
    canUploadCreative,
    canManageWorkflow,
    canAdmin,
  } = useRole();

  // 1. Dedicated Authoritative Single-Item Query (PostgreSQL direct)
  const [detailData, setDetailData] = useState<ContentItemDetailDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Creative Asset Upload State
  const [isUploadingCreative, setIsUploadingCreative] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!projectId || !itemId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await getAuthoritativeContentItemDetailAction(projectId, itemId, activeUserId || undefined);
      if (res.success && res.data) {
        setDetailData(res.data);
      } else {
        setLoadError(res.error || "Content deliverable not found.");
      }
    } catch (err: any) {
      setLoadError(err.message || "Failed to load content deliverable.");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, itemId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const project = detailData?.project || state.projects.find((p) => p.id === projectId);
  const item = detailData?.item || state.contentItems.find((i) => i.id === itemId);

  // Multi-Platform Content Group (Phase 3)
  const contentGroup = detailData?.contentGroup || (item?.contentGroupId ? state.contentGroups.find((g) => g.id === item.contentGroupId) : undefined);
  const siblingGroupItems = detailData?.siblingGroupItems || (item?.contentGroupId ? state.contentItems.filter((i) => i.contentGroupId === item.contentGroupId) : []);

  // Phase 3 Modals State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncCopyCheck, setSyncCopyCheck] = useState(true);
  const [syncCreativeCheck, setSyncCreativeCheck] = useState(true);
  const [syncDateCheck, setSyncDateCheck] = useState(false);
  const [syncReason, setSyncReason] = useState("");

  const [isMarkPublishedModalOpen, setIsMarkPublishedModalOpen] = useState(false);
  const [publishLiveUrlInput, setPublishLiveUrlInput] = useState(item?.liveUrl || "");
  const [publishDateInput, setPublishDateInput] = useState(
    item?.publishedAt ? item.publishedAt.slice(0, 16) : new Date().toISOString().slice(0, 16)
  );

  const [isEditPublicationModalOpen, setIsEditPublicationModalOpen] = useState(false);
  const [editPublishedDateInput, setEditPublishedDateInput] = useState(
    item?.publishedAt ? item.publishedAt.slice(0, 16) : new Date().toISOString().slice(0, 16)
  );
  const [editLiveUrlInput, setEditLiveUrlInput] = useState(item?.liveUrl || "");
  const [editPublicationReason, setEditPublicationReason] = useState("");

  // Active Assignment & Work Sessions (Phase 2)
  const activeAssignment = detailData?.activeAssignment || state.contentAssignments.find(
    (a) => a.contentItemId === itemId && a.status !== "reassigned"
  );
  const itemWorkSessions = detailData?.itemWorkSessions || state.workSessions.filter((ws) => ws.contentItemId === itemId);
  const currentActiveSession = itemWorkSessions.find(
    (ws) => ws.userId === activeUserId && ws.status === "active"
  );
  const currentPausedSession = itemWorkSessions.find(
    (ws) => ws.userId === activeUserId && ws.status === "paused"
  );

  // Live timer tick state
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    if (!currentActiveSession) return;
    const interval = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [currentActiveSession]);

  // Phase 2 Modals State
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignRole, setReassignRole] = useState<AssignmentRole>("designer");
  const [reassignDueAt, setReassignDueAt] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [newDeadlineVal, setNewDeadlineVal] = useState("");
  const [deadlineReasonVal, setDeadlineReasonVal] = useState("");

  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustSessionId, setAdjustSessionId] = useState("");
  const [adjustMinutes, setAdjustMinutes] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  const [concurrencyErrorMessage, setConcurrencyErrorMessage] = useState<string | null>(null);
  const [concurrencyTaskTitle, setConcurrencyTaskTitle] = useState<string | null>(null);
  const [timerActionError, setTimerActionError] = useState<string | null>(null);
  const [isTimerLoading, setIsTimerLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleStartTimer = async () => {
    setIsTimerLoading(true);
    setTimerActionError(null);
    try {
      const res = await startWorkSessionAction({
        contentItemId: itemId,
        actorUserId: activeUserId,
      });
      if (res.success) {
        setConcurrencyErrorMessage(null);
        setConcurrencyTaskTitle(null);
        await loadDetail();
      } else {
        if (res.code === "ACTIVE_TIMER_CONFLICT") {
          setConcurrencyTaskTitle(res.activeTaskTitle || null);
          setConcurrencyErrorMessage(res.error || "Active timer already running.");
        } else {
          setTimerActionError(res.error || "Failed to start work timer.");
        }
      }
    } catch (err: any) {
      setTimerActionError(err.message || "Failed to start work timer.");
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handlePauseTimer = async (sessionId: string) => {
    setIsTimerLoading(true);
    setTimerActionError(null);
    try {
      const res = await pauseWorkSessionAction({
        workSessionId: sessionId,
        actorUserId: activeUserId,
      });
      if (res.success) {
        await loadDetail();
      } else {
        setTimerActionError(res.error || "Failed to pause work session.");
      }
    } catch (err: any) {
      setTimerActionError(err.message || "Failed to pause work session.");
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handleResumeTimer = async (sessionId: string) => {
    setIsTimerLoading(true);
    setTimerActionError(null);
    try {
      const res = await resumeWorkSessionAction({
        workSessionId: sessionId,
        actorUserId: activeUserId,
      });
      if (res.success) {
        setConcurrencyErrorMessage(null);
        setConcurrencyTaskTitle(null);
        await loadDetail();
      } else {
        if (res.code === "ACTIVE_TIMER_CONFLICT") {
          setConcurrencyTaskTitle(res.activeTaskTitle || null);
          setConcurrencyErrorMessage(res.error || "Active timer already running.");
        } else {
          setTimerActionError(res.error || "Failed to resume work session.");
        }
      }
    } catch (err: any) {
      setTimerActionError(err.message || "Failed to resume work session.");
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handleStopTimer = async (sessionId: string) => {
    setIsTimerLoading(true);
    setTimerActionError(null);
    try {
      const res = await stopWorkSessionAction({
        workSessionId: sessionId,
        actorUserId: activeUserId,
      });
      if (res.success) {
        await loadDetail();
      } else {
        setTimerActionError(res.error || "Failed to stop work session.");
      }
    } catch (err: any) {
      setTimerActionError(err.message || "Failed to stop work session.");
    } finally {
      setIsTimerLoading(false);
    }
  };

  // Versions for this item
  const itemVersions = detailData?.itemVersions || state.submissionVersions.filter(
    (v) => v.contentItemId === itemId
  );

  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  useEffect(() => {
    if (detailData && !selectedVersionId) {
      const vId =
        detailData.item.latestSubmittedVersionId ||
        detailData.item.activeDraftVersionId ||
        detailData.itemVersions[0]?.id ||
        "";
      setSelectedVersionId(vId);
    }
  }, [detailData, selectedVersionId]);

  const currentVersion =
    itemVersions.find((v) => v.id === selectedVersionId) ||
    itemVersions[itemVersions.length - 1];

  // Diff / comparison version
  const [diffVersionId, setDiffVersionId] = useState<string | null>(null);
  const diffVersion = itemVersions.find((v) => v.id === diffVersionId);

  // Modals state
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");

  const [isChangeRequestModalOpen, setIsChangeRequestModalOpen] = useState(false);
  const [crComponent, setCrComponent] = useState<ApprovalComponentType>("copy");
  const [crText, setCrText] = useState("");
  const [crPriority, setCrPriority] = useState<"high" | "medium" | "low">("high");

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [allowDownload, setAllowDownload] = useState(false);
  const [generatedLinkUrl, setGeneratedLinkUrl] = useState("");

  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [driveUrlInput, setDriveUrlInput] = useState("");
  const [isAttachingDrive, setIsAttachingDrive] = useState(false);

  // Designer Response Draft state
  const [designerResponses, setDesignerResponses] = useState<Record<string, string>>({});

  // Internal Comments Draft state
  const [newCommentBody, setNewCommentBody] = useState("");

  // New Draft Editing State
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftCaption, setDraftCaption] = useState(currentVersion?.copy?.caption || "");
  const [draftHashtags, setDraftHashtags] = useState(currentVersion?.copy?.hashtags?.join(" ") || "");
  const [draftCTA, setDraftCTA] = useState(currentVersion?.copy?.cta || "");

  useEffect(() => {
    if (currentVersion?.copy) {
      setDraftCaption(currentVersion.copy.caption || "");
      setDraftHashtags((currentVersion.copy.hashtags || []).join(" "));
      setDraftCTA(currentVersion.copy.cta || "");
    }
  }, [currentVersion?.id]);

  if (isLoading && !detailData) {
    return (
      <div className="p-20 text-center flex flex-col items-center justify-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0071e3] border-t-transparent" />
        <p className="text-[14px] text-[#86868b]">Loading deliverable detail...</p>
      </div>
    );
  }

  if (loadError || !item || !project || !currentVersion) {
    return (
      <div className="p-16 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-[#fff0ee] flex items-center justify-center text-[#d70015]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="text-[17px] font-semibold text-[#1d1d1f]">
          {loadError || "Content deliverable not found."}
        </h3>
        <p className="text-[13px] text-[#86868b] max-w-md mx-auto">
          The requested deliverable may not exist in this project or you do not have permission to view it.
        </p>
        <div className="pt-2">
          <Link
            href={`/projects/${projectId}/kanban`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition"
          >
            Return to Kanban
          </Link>
        </div>
      </div>
    );
  }

  // Approval Matrix Summary
  const approvalDecisions = detailData?.approvalDecisions || state.approvalDecisions;
  const founderOverrides = detailData?.founderOverrides || state.founderOverrides;
  const approvalSummary = getItemApprovalMatrixSummary(
    item,
    currentVersion,
    approvalDecisions,
    founderOverrides
  );

  // Change Requests for this item
  const itemChangeRequests = detailData?.changeRequests || state.changeRequests.filter(
    (cr) => cr.contentItemId === item.id
  );
  const unaddressedOpenRequests = itemChangeRequests.filter(
    (cr) => cr.status === "open" && !cr.designerResponse
  );
  const canResubmit = unaddressedOpenRequests.length === 0;

  const isOwner = activeUserId === activeAssignment?.assigneeUserId || activeUserId === item.accountOwnerId;
  const isManagement = ["founder", "admin", "consultant"].includes(activeRole);
  const canSubmitReview = (isOwner || isManagement) && (item.stage === "draft" || item.stage === "changes_requested");
  const [isSubmittingForReview, setIsSubmittingForReview] = useState(false);

  // Comments for this item (Internal + External)
  const itemComments = detailData?.comments || state.comments.filter((c) => c.contentItemId === item.id);
  const projectMembers = detailData?.projectMembers || [];

  // Handlers
  const handleDecision = async (
    component: ApprovalComponentType,
    decision: ComponentDecision
  ) => {
    recordApprovalDecision({
      contentItemId: item.id,
      submissionVersionId: currentVersion.id,
      component,
      reviewerUserId: activeUserId,
      reviewerRole: activeRole === "founder" ? "founder" : "consultant",
      decision,
    });
    try {
      await recordApprovalDecisionAction({
        actorUserId: activeUserId,
        submissionVersionId: currentVersion.id,
        component,
        decision: decision as any,
      });
      await loadDetail();
    } catch (e) {
      console.error("Failed to record decision:", e);
    }
  };

  const handleApplyOverride = async () => {
    if (!overrideReason.trim()) {
      alert("A mandatory reason is required to log a Founder Override.");
      return;
    }
    recordFounderOverride({
      contentItemId: item.id,
      submissionVersionId: currentVersion.id,
      actorUserId: activeUserId,
      reason: overrideReason.trim(),
    });
    try {
      await recordFounderOverrideAction({
        actorUserId: activeUserId,
        contentItemId: item.id,
        submissionVersionId: currentVersion.id,
        justification: overrideReason.trim(),
      });
      await loadDetail();
    } catch (e) {
      console.error("Failed to apply override:", e);
    }
    setIsOverrideModalOpen(false);
    setOverrideReason("");
  };

  const handleRevokeApproval = async () => {
    if (!revokeReason.trim()) {
      alert("A mandatory reason is required to revoke an approval.");
      return;
    }
    const activeDec = approvalDecisions.find(
      (d) => d.submissionVersionId === currentVersion.id && d.reviewerUserId === activeUserId
    );
    if (activeDec) {
      revokeApprovalDecision(activeDec.id, revokeReason.trim(), activeUserId);
      try {
        await revokeApprovalDecisionAction({
          actorUserId: activeUserId,
          decisionId: activeDec.id,
          reason: revokeReason.trim(),
        });
        await loadDetail();
      } catch (e) {
        console.error("Failed to revoke decision:", e);
      }
    }
    setIsRevokeModalOpen(false);
    setRevokeReason("");
  };

  const handleLogChangeRequest = async () => {
    if (!crText.trim()) return;
    const reviewerName =
      projectMembers.find((u) => u.userId === activeUserId)?.name ||
      state.users.find((u) => u.id === activeUserId)?.name ||
      "Reviewer";

    createChangeRequest({
      projectId,
      contentItemId: item.id,
      submissionVersionId: currentVersion.id,
      component: crComponent,
      reviewerUserId: activeUserId,
      reviewerName,
      requestedChange: crText.trim(),
      priority: crPriority,
    });

    try {
      await createChangeRequestAction({
        actorUserId: activeUserId,
        submissionVersionId: currentVersion.id,
        component: crComponent,
        requestedChange: crText.trim(),
        priority: crPriority,
      });
      await loadDetail();
    } catch (e) {
      console.error("Failed to create change request:", e);
    }

    setIsChangeRequestModalOpen(false);
    setCrText("");
  };

  const handleDesignerRespond = async (crId: string) => {
    const text = designerResponses[crId];
    if (!text?.trim()) return;
    respondToChangeRequest(crId, text.trim());
    try {
      await respondToChangeRequestAction({
        actorUserId: activeUserId,
        changeRequestId: crId,
        responseText: text.trim(),
      });
      await loadDetail();
    } catch (e) {
      console.error("Failed to respond to change request:", e);
    }
  };

  const handleSubmitForReview = async () => {
    if (item.stage === "changes_requested" && !canResubmit) {
      alert("Cannot resubmit while open change requests remain without a designer response.");
      return;
    }

    setIsSubmittingForReview(true);
    try {
      // 1. Check if current version is already a draft; if not, create a new version draft for revision
      let draftVersionId = currentVersion?.id;
      if (!currentVersion?.isDraft) {
        const createRes = await createNewVersionDraftAction({
          actorUserId: activeUserId,
          contentItemId: item.id,
          baseVersionId: currentVersion?.id,
        });
        if (!createRes.success || !(createRes as any).version) {
          alert(createRes.error || "Failed to create new revision version draft.");
          return;
        }
        draftVersionId = (createRes as any).version.id;
      }

      // 2. If user is currently editing draft copy, persist it
      if (isEditingDraft && draftVersionId) {
        const saveRes = await saveDraftVersionAction({
          actorUserId: activeUserId,
          submissionVersionId: draftVersionId,
          updates: {
            caption: draftCaption,
            hashtags: draftHashtags.split(" ").filter((h) => h.trim().length > 0),
            cta: draftCTA,
          },
        });

        if (!saveRes.success) {
          alert(saveRes.error || "Failed to save draft version copy.");
          return;
        }
      }

      // 3. Freeze version and submit for review in PostgreSQL atomically
      const submitRes = await submitVersionAction({
        actorUserId: activeUserId,
        contentItemId: item.id,
        submissionVersionId: draftVersionId,
      });

      if (submitRes.success) {
        if (draftVersionId) setSelectedVersionId(draftVersionId);
        setIsEditingDraft(false);
        await loadDetail();
      } else {
        alert(submitRes.error || "Failed to submit deliverable for review.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to submit deliverable for review.");
    } finally {
      setIsSubmittingForReview(false);
    }
  };

  const handleResubmit = handleSubmitForReview;

  const handleGenerateShareLink = async () => {
    if (!currentVersion?.id) {
      alert("No valid submitted version available to generate review link.");
      return;
    }

    const res = await generateExternalReviewTokenAction({
      actorUserId: activeUserId,
      contentItemId: item.id,
      submissionVersionId: currentVersion.id,
      allowDownload,
      expiresInDays: 7,
    });

    if (res.success && res.reviewUrl) {
      const url = `${window.location.origin}${res.reviewUrl}`;
      setGeneratedLinkUrl(url);
    } else {
      alert(res.error || "Failed to generate external review link.");
    }
  };

  const handleCreativeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      setUploadError(`File exceeds maximum size limit of 100MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
      return;
    }

    setIsUploadingCreative(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      // 1. Request upload intent from authoritative server action
      const intentRes = await requestCreativeAssetUploadAction({
        projectId,
        contentItemId: itemId,
        filename: file.name,
        mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
        fileSizeBytes: file.size,
        actorUserId: activeUserId,
      });

      if (!intentRes.success || !intentRes.presignedUrl || !intentRes.assetId) {
        throw new Error(intentRes.error || "Failed to initialize upload authorization.");
      }

      // 2. Direct browser PUT to Cloudflare R2
      const putRes = await fetch(intentRes.presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error(`Upload to storage failed (${putRes.status} ${putRes.statusText})`);
      }

      // 3. Confirm upload and bind to submission version
      const confirmRes = await confirmCreativeAssetUploadAction({
        assetId: intentRes.assetId,
        submissionVersionId: intentRes.submissionVersionId!,
        contentItemId: itemId,
        actorUserId: activeUserId,
      });

      if (!confirmRes.success) {
        throw new Error(confirmRes.error || "Failed to finalize asset linkage.");
      }

      setUploadSuccess(`Successfully uploaded "${file.name}"`);
      await loadDetail();
    } catch (err: any) {
      console.error("[CreativeUpload] Error:", err);
      setUploadError(err.message || "An unexpected error occurred during upload.");
    } finally {
      setIsUploadingCreative(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleRemoveAsset = async (assetId: string) => {
    if (!currentVersion?.id) return;
    try {
      setUploadError(null);
      const res = await removeCreativeAssetFromSubmissionAction({
        assetId,
        submissionVersionId: currentVersion.id,
        actorUserId: activeUserId,
      });
      if (res.success) {
        await loadDetail();
      } else {
        setUploadError(res.error || "Failed to remove asset.");
      }
    } catch (err: any) {
      setUploadError(err.message || "Failed to remove asset.");
    }
  };

  const handleAddDriveLink = async () => {
    if (!driveUrlInput.trim()) return;
    setIsAttachingDrive(true);
    setUploadError(null);
    try {
      const res = await attachExternalAssetAction({
        projectId,
        contentItemId: item.id,
        externalUrl: driveUrlInput.trim(),
        actorUserId: activeUserId,
      });
      if (res.success) {
        setUploadSuccess("External link attached successfully!");
        setDriveUrlInput("");
        setIsDriveModalOpen(false);
        await loadDetail();
      } else {
        setUploadError(res.error || "Failed to attach external link.");
      }
    } catch (err: any) {
      setUploadError(err.message || "Failed to attach external link.");
    } finally {
      setIsAttachingDrive(false);
    }
  };

  const handlePostComment = () => {
    if (!newCommentBody.trim()) return;
    addComment({
      projectId,
      contentItemId: item.id,
      submissionVersionId: currentVersion.id,
      authorUserId: activeUserId,
      visibility: "internal",
      body: newCommentBody.trim(),
    });
    setNewCommentBody("");
  };

  const linkedScript = detailData?.linkedScript || state.scripts.find((s) => s.linkedContentItemId === item.id);

  const assignedMember = projectMembers.find((m) => m.userId === item.accountableOwnerId);
  const isUiDesign = detailData?.project?.projectType === "ui_design" || item.projectType === "ui_design";

  return (
    <div className="flex-1 flex flex-col bg-[#ffffff] min-h-[calc(100vh-3.5rem)]">
      {/* Apple-style Top Workspace Header */}
      <div className="h-16 border-b border-black/[0.08] px-6 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-14 z-20">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}`}
            className="flex items-center gap-1.5 rounded-full p-2 text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
                {isUiDesign ? `UI Design • ${item.workType || "Screen"}` : `${item.platform} • ${item.contentType}`}
              </span>
              <h1 className="text-[17px] font-semibold text-[#1d1d1f] truncate max-w-md">
                {item.title}
              </h1>
              {/* Authoritative Lifecycle Badge */}
              {item.stage === "draft" && (
                <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[11px] font-semibold text-[#6e6e73] border border-black/[0.06]">
                  Draft {currentVersion?.versionNumber ? `(V${currentVersion.versionNumber})` : ""}
                </span>
              )}
              {item.stage === "submitted" && (
                <span className="inline-flex items-center rounded-full bg-[#eaf4ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#0066cc] border border-[#b8daff]">
                  Submitted
                </span>
              )}
              {item.stage === "in_review" && (
                <span className="status-badge status-in-review rounded-full px-2.5 py-0.5 text-[11px] font-semibold flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> In Review
                </span>
              )}
              {item.stage === "changes_requested" && (
                <span className="status-changes rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                  Changes Requested
                </span>
              )}
              {item.stage === "approved" && (
                <span className="status-approved rounded-full px-2.5 py-0.5 text-[11px] font-bold flex items-center gap-1">
                  <Check className="h-3 w-3" /> Approved
                </span>
              )}
              {item.stage === "scheduled" && (
                <span className="rounded-full bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9] px-2.5 py-0.5 text-[11px] font-semibold">
                  Scheduled
                </span>
              )}
              {item.stage === "published" && (
                <span className="rounded-full bg-[#f3e5f5] text-[#7b1fa2] border border-[#e1bee7] px-2.5 py-0.5 text-[11px] font-semibold">
                  Published
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          {/* Share with Client Link Generator (Founder, Consultant, Admin only) */}
          {(activeRole === "founder" || activeRole === "consultant" || activeRole === "admin") && (
            <button
              onClick={() => {
                setGeneratedLinkUrl("");
                setIsShareModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition"
            >
              <Share2 className="h-3.5 w-3.5" /> Client Preview Link (V{currentVersion?.versionNumber})
            </button>
          )}

          {/* Delete Deliverable Action (Founder, Consultant, Admin only) */}
          {(activeRole === "founder" || activeRole === "consultant" || activeRole === "admin") && (
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 px-3.5 py-1.5 text-[13px] font-medium text-red-600 dark:text-red-400 transition"
              title="Delete this deliverable"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}

          {/* Primary Action Button */}
          {item.stage === "draft" && canSubmitReview ? (
            <button
              onClick={handleSubmitForReview}
              disabled={isSubmittingForReview}
              className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
            >
              {isSubmittingForReview ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Submit for Review</span>
            </button>
          ) : item.stage === "draft" ? (
            <span className="rounded-full bg-[#f2f2f7] px-3.5 py-1.5 text-[13px] font-medium text-[#6e6e73] border border-black/[0.06]">
              Draft (WIP)
            </span>
          ) : item.stage === "changes_requested" && canSubmitReview ? (
            <button
              onClick={handleSubmitForReview}
              disabled={isSubmittingForReview}
              className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
            >
              {isSubmittingForReview ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Submit Revision</span>
            </button>
          ) : approvalSummary.allComponentsApproved ? (
            <span className="status-approved rounded-full px-3.5 py-1.5 text-[13px] font-semibold flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Approved for Schedule
            </span>
          ) : canOverride ? (
            <button
              onClick={() => setIsOverrideModalOpen(true)}
              className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
            >
              Founder Override
            </button>
          ) : (
            <span className="status-badge status-in-review rounded-full px-3.5 py-1.5 text-[13px] font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> In Review
            </span>
          )}
        </div>
      </div>

      {/* 3-Column Apple Workspace Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-black/[0.08]">
        {/* ======================================================== */}
        {/* COLUMN 1: Metadata, Script & Version History (3 cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-3 bg-[#fbfbfd] p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-7.5rem)]">
          {/* Version Selector */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1d1d1f]">Version History</span>
              <span className="text-[12px] text-[#86868b]">{itemVersions.length} revisions</span>
            </div>

            <div className="space-y-1">
              {itemVersions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVersionId(v.id);
                    setDraftCaption(v.copy.caption);
                    setDraftHashtags(v.copy.hashtags.join(" "));
                    setDraftCTA(v.copy.cta);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-[13px] transition ${
                    v.id === currentVersion.id
                      ? "bg-[#f5f5f7] text-[#1d1d1f] font-semibold"
                      : "text-[#6e6e73] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                  }`}
                >
                  <div>
                    <span className="font-medium">Version {v.versionNumber}</span>
                    <div className="text-[11px] text-[#86868b]">
                      {formatDate(v.createdAt)}
                    </div>
                  </div>
                  {v.id === currentVersion.id && <Check className="h-4 w-4 text-[#0071e3]" />}
                </button>
              ))}
            </div>

            {/* Version Diff Switcher */}
            {itemVersions.length > 1 && (
              <div className="pt-2 border-t border-black/[0.06] space-y-1.5">
                <span className="text-[11px] text-[#86868b] font-medium">Compare with Version:</span>
                <select
                  value={diffVersionId || ""}
                  onChange={(e) => setDiffVersionId(e.target.value || null)}
                  className="w-full bg-[#f5f5f7] border border-black/[0.08] rounded-lg p-1.5 text-[12px] text-[#1d1d1f]"
                >
                  <option value="">None (Single view)</option>
                  {itemVersions
                    .filter((v) => v.id !== currentVersion.id)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.versionNumber}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Multi-Platform Creative Group Card (Phase 3) */}
          {contentGroup && (
            <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#0071e3]" /> Multi-Platform Group
                </h3>
                <span className="text-[11px] font-medium text-[#0071e3] bg-[#f0f7ff] px-2 py-0.5 rounded-full border border-[#d0e5ff]">
                  {siblingGroupItems.length} Platforms
                </span>
              </div>

              <div>
                <h4 className="font-semibold text-[13px] text-[#1d1d1f] truncate">{contentGroup.title}</h4>
                {contentGroup.conceptNotes && (
                  <p className="text-[11px] text-[#6e6e73] mt-0.5 line-clamp-2">{contentGroup.conceptNotes}</p>
                )}
              </div>

              {/* Sibling Platform Switcher Pills */}
              <div className="space-y-1 pt-1">
                <span className="text-[11px] font-medium text-[#86868b] block">Linked Deliverables:</span>
                <div className="flex flex-wrap gap-1.5">
                  {siblingGroupItems.map((sibling) => (
                    <Link
                      key={sibling.id}
                      href={`/projects/${projectId}/content/${sibling.id}`}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium transition ${
                        sibling.id === item.id
                          ? "bg-[#1d1d1f] text-white"
                          : "bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] border border-black/[0.06]"
                      }`}
                    >
                      <span>{sibling.platform}</span>
                      <span className="text-[10px] opacity-75">({sibling.stage.replace(/_/g, " ")})</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Sync Action */}
              {(canManageWorkflow || activeRole === "founder" || activeRole === "consultant" || activeRole === "admin") && (
                <button
                  onClick={() => setIsSyncModalOpen(true)}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] py-2 text-[12px] font-medium text-[#1d1d1f] border border-black/[0.06] transition"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#0071e3]" /> Sync Across Platforms...
                </button>
              )}
            </div>
          )}

          {/* Client Portal Visibility Control (Phase 5) */}
          {(canManageWorkflow || activeRole === "founder" || activeRole === "consultant" || activeRole === "admin") && (
            <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#34c759]" />
                  <span className="text-[13px] font-semibold text-[#1d1d1f]">Client Portal Visibility</span>
                </div>
                <button
                  onClick={async () => {
                    const newVisibility = !item.clientVisible;
                    const res = await toggleClientVisibilityAction({
                      actorUserId: activeUserId,
                      contentItemId: item.id,
                      clientVisible: newVisibility,
                    });
                    if (res.success) {
                      setClientVisibility({
                        contentItemId: item.id,
                        clientVisible: newVisibility,
                        actorUserId: activeUserId,
                      });
                    } else {
                      alert(res.error || "Failed to update client visibility.");
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                    item.clientVisible
                      ? "bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]"
                      : "bg-[#f2f2f7] text-[#86868b] border border-black/[0.06]"
                  }`}
                >
                  {item.clientVisible ? "● Visible to Client" : "Hidden from Client"}
                </button>
              </div>
              <p className="text-[11px] text-[#6e6e73]">
                {item.clientVisible
                  ? "Approved deliverables are visible in the authenticated Client Portal."
                  : "Private to agency team. Hidden from client overview, calendar, and creative library."}
              </p>
            </div>
          )}

          {/* Content Assignment & Work Ownership (Phase 2) */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[#0071e3]" /> Assigned Work
              </h3>
              <span
                className={`text-[11px] font-semibold capitalize px-2.5 py-0.5 rounded-full border ${
                  activeAssignment?.status === "completed"
                    ? "bg-[#eaf6ed] text-[#1f6f32] border-[#ceead6]"
                    : activeAssignment?.status === "submitted"
                    ? "bg-[#eaf4ff] text-[#0066cc] border-[#b8daff]"
                    : activeAssignment?.status === "in_progress"
                    ? "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]"
                    : "bg-[#f2f2f7] text-[#1d1d1f] border-black/[0.06]"
                }`}
              >
                {activeAssignment?.status?.replace(/_/g, " ") || "Assigned"}
              </span>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#fbfbfd] border border-black/[0.04]">
              <UserAvatar
                avatar={assignedMember?.avatar}
                name={assignedMember?.name}
                className="h-8 w-8 text-[12px]"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[#1d1d1f] text-[13px] truncate">
                  {assignedMember?.userId === activeUserId ? "Assigned to you" : assignedMember?.name || "Unassigned"}
                </div>
                <div className="text-[11px] text-[#86868b] truncate">
                  {assignedMember?.userId === activeUserId && assignedMember?.name ? `${assignedMember.name} • ` : ""}
                  Role: {activeAssignment?.assignmentRole || assignedMember?.role || "Designer"}
                </div>
              </div>
            </div>

            {/* Deadlines Display */}
            <div className="space-y-1.5 pt-2 border-t border-black/[0.06] text-[12px]">
              <div className="flex items-center justify-between text-[#6e6e73]">
                <span>Internal Due Date:</span>
                <span className="font-semibold text-[#1d1d1f]">
                  {formatDate(item.finalInternalDeadline || item.calculatedInternalDeadline || item.deadlines?.submissionDeadline || activeAssignment?.currentDueAt || "")}
                </span>
              </div>
              {item.clientDeliveryDate && (
                <div className="flex items-center justify-between text-[#6e6e73]">
                  <span>Client Delivery Date:</span>
                  <span className="font-semibold text-[#0071e3]">
                    {formatDate(item.clientDeliveryDate)}
                  </span>
                </div>
              )}
            </div>

            {/* Management Actions: Reassign & Edit Deadline */}
            {(activeRole === "founder" || activeRole === "consultant" || activeRole === "admin" || canManageWorkflow) && (
              <div className="pt-2 border-t border-black/[0.06] flex items-center gap-2">
                <button
                  onClick={() => {
                    setReassignUserId(activeAssignment?.assigneeUserId || item.accountableOwnerId || "");
                    setReassignRole(activeAssignment?.assignmentRole || "designer");
                    setReassignDueAt(item.finalInternalDeadline || item.calculatedInternalDeadline || item.deadlines?.submissionDeadline || activeAssignment?.currentDueAt || "");
                    setReassignReason("");
                    setIsReassignModalOpen(true);
                  }}
                  className="flex-1 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] py-1.5 text-[12px] font-medium text-[#1d1d1f] border border-black/[0.06] transition text-center"
                >
                  Reassign...
                </button>
                <button
                  onClick={() => {
                    setNewDeadlineVal(item.finalInternalDeadline || item.calculatedInternalDeadline || item.deadlines?.submissionDeadline || activeAssignment?.currentDueAt || "");
                    setDeadlineReasonVal("");
                    setIsDeadlineModalOpen(true);
                  }}
                  className="flex-1 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] py-1.5 text-[12px] font-medium text-[#1d1d1f] border border-black/[0.06] transition text-center"
                >
                  Change Internal Due Date
                </button>
              </div>
            )}
          </div>

          {/* Time Tracking & Work Session Widget (Phase 2) */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-[#0071e3]" /> Work Timer (Task Effort)
              </h3>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  currentActiveSession
                    ? "bg-[#eaf6ed] text-[#1f6f32] animate-pulse"
                    : currentPausedSession
                    ? "bg-[#fff8e6] text-[#9a6700]"
                    : "bg-[#f2f2f7] text-[#86868b]"
                }`}
              >
                {currentActiveSession ? "● Tracking Live" : currentPausedSession ? "❚❚ Paused" : "Inactive"}
              </span>
            </div>

            {/* Live Clock Display */}
            <div className="p-3 bg-[#fbfbfd] border border-black/[0.06] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#86868b] block">Current Session:</span>
                <span className="text-[20px] font-mono font-bold text-[#1d1d1f]">
                  {currentActiveSession
                    ? (() => {
                        const elapsed =
                          currentActiveSession.accumulatedSeconds +
                          Math.max(
                            0,
                            Math.floor((Date.now() - Date.parse(currentActiveSession.activeSegmentStartedAt || "")) / 1000)
                          );
                        const mins = Math.floor(elapsed / 60);
                        const secs = elapsed % 60;
                        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
                      })()
                    : currentPausedSession
                    ? (() => {
                        const mins = Math.floor(currentPausedSession.accumulatedSeconds / 60);
                        const secs = currentPausedSession.accumulatedSeconds % 60;
                        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
                      })()
                    : "00:00"}
                </span>
              </div>

              {/* Timer Controls */}
              <div className="flex items-center gap-1.5">
                {currentActiveSession ? (
                  <>
                    <button
                      onClick={() => handlePauseTimer(currentActiveSession.id)}
                      disabled={isTimerLoading}
                      className="p-2 rounded-lg bg-[#fff8e6] text-[#9a6700] hover:bg-[#ffe082] disabled:opacity-50 transition"
                      title="Pause Timer"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleStopTimer(currentActiveSession.id)}
                      disabled={isTimerLoading}
                      className="p-2 rounded-lg bg-[#fff0ee] text-[#b42318] hover:bg-[#ffd5d0] disabled:opacity-50 transition"
                      title="Stop & Complete Session"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  </>
                ) : currentPausedSession ? (
                  <>
                    <button
                      onClick={() => handleResumeTimer(currentPausedSession.id)}
                      disabled={isTimerLoading}
                      className="p-2 rounded-lg bg-[#eaf6ed] text-[#1f6f32] hover:bg-[#ceead6] disabled:opacity-50 transition"
                      title="Resume Timer"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleStopTimer(currentPausedSession.id)}
                      disabled={isTimerLoading}
                      className="p-2 rounded-lg bg-[#fff0ee] text-[#b42318] hover:bg-[#ffd5d0] disabled:opacity-50 transition"
                      title="Stop Session"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  (activeRole === "designer" || activeAssignment?.assigneeUserId === activeUserId || canAdmin) && (
                    <button
                      onClick={handleStartTimer}
                      disabled={isTimerLoading}
                      className="flex items-center gap-1 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white px-3 py-1.5 text-[12px] font-medium transition shadow-sm"
                    >
                      <Play className="h-3 w-3" /> {isTimerLoading ? "Starting..." : "Start Task Timer"}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Inline Timer Action Error (e.g. Assignment Not Found, Inactive) */}
            {timerActionError && (
              <div className="p-2.5 bg-[#fff0ee] border border-[#fecdca] text-[#b42318] text-[12px] rounded-xl flex items-center justify-between gap-2">
                <span>{timerActionError}</span>
                <button
                  onClick={() => setTimerActionError(null)}
                  className="text-[#b42318] font-bold text-xs hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Total Item Tracked Time */}
            <div className="flex items-center justify-between text-[12px] pt-1">
              <span className="text-[#86868b]">Total Verified Time:</span>
              <span className="font-semibold text-[#1d1d1f]">
                {Math.round(
                  itemWorkSessions.reduce((acc, ws) => {
                    let s = ws.accumulatedSeconds;
                    if (ws.status === "active" && ws.activeSegmentStartedAt) {
                      s += Math.max(0, Math.floor((Date.now() - Date.parse(ws.activeSegmentStartedAt)) / 1000));
                    }
                    return acc + s;
                  }, 0) / 60
                )}{" "}
                mins ({itemWorkSessions.length} session(s))
              </span>
            </div>

            {/* Admin Manual Adjustment Button */}
            {(canAdmin || activeRole === "founder" || activeRole === "admin") && itemWorkSessions.length > 0 && (
              <button
                onClick={() => {
                  const lastSession = itemWorkSessions[itemWorkSessions.length - 1];
                  setAdjustSessionId(lastSession.id);
                  setAdjustMinutes(Math.round(lastSession.accumulatedSeconds / 60));
                  setAdjustReason("");
                  setIsAdjustmentModalOpen(true);
                }}
                className="w-full text-center text-[11px] text-[#0066cc] hover:underline font-medium pt-1"
              >
                Adjust Tracked Session Duration...
              </button>
            )}
          </div>

          {/* Operational Deadlines */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <h3 className="text-[13px] font-semibold text-[#1d1d1f]">Operational Deadlines</h3>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#86868b]">Operational Due Date</span>
                <span className="font-semibold text-[#1d1d1f]">
                  {formatDate(item.finalInternalDeadline || item.calculatedInternalDeadline || item.deadlines?.submissionDeadline || activeAssignment?.currentDueAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#86868b]">Assignment Due</span>
                <span className="font-medium text-[#1d1d1f]">
                  {formatDate(activeAssignment?.currentDueAt || activeAssignment?.initialDueAt || item.deadlines?.submissionDeadline)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#86868b]">Scheduled Release</span>
                <span className="font-semibold text-[#0071e3]">
                  {formatDate(item.deadlines.scheduledPublicationDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Canonical Publication Details (Phase 3) */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-[#0071e3]" /> Publication Status
              </h3>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                  item.stage === "published"
                    ? "bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]"
                    : "bg-[#f2f2f7] text-[#86868b]"
                }`}
              >
                {item.stage === "published" ? "● Published Live" : "Unpublished"}
              </span>
            </div>

            {item.stage === "published" ? (
              <div className="space-y-2.5 text-[13px]">
                <div className="flex justify-between items-center">
                  <span className="text-[#86868b]">Canonical Live Date</span>
                  <span className="font-bold text-[#1f6f32]">
                    {formatDateTime(item.publishedAt)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#86868b]">Originally Scheduled</span>
                  <span className="font-medium text-[#1d1d1f]">
                    {formatDate(item.deadlines.scheduledPublicationDate)}
                  </span>
                </div>
                {item.liveUrl && (
                  <div className="pt-1">
                    <span className="text-[11px] text-[#86868b] block">Live Link:</span>
                    <a
                      href={item.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-[#0066cc] hover:underline flex items-center gap-1 truncate font-medium mt-0.5"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" /> {item.liveUrl}
                    </a>
                  </div>
                )}

                {(canAdmin || activeRole === "founder" || activeRole === "admin") && (
                  <button
                    onClick={() => {
                      setEditPublishedDateInput(
                        item.publishedAt ? item.publishedAt.slice(0, 16) : new Date().toISOString().slice(0, 16)
                      );
                      setEditLiveUrlInput(item.liveUrl || "");
                      setEditPublicationReason("");
                      setIsEditPublicationModalOpen(true);
                    }}
                    className="w-full text-center text-[11px] text-[#0066cc] hover:underline font-medium pt-1"
                  >
                    Edit Canonical Publication Details...
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <p className="text-[12px] text-[#6e6e73]">
                  Scheduled for {formatDate(item.deadlines.scheduledPublicationDate)}.
                </p>
                {(approvalSummary.allComponentsApproved || canOverride || canManageWorkflow) && (
                  <button
                    onClick={() => {
                      setPublishLiveUrlInput(item.liveUrl || "");
                      setPublishDateInput(new Date().toISOString().slice(0, 16));
                      setIsMarkPublishedModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#1f6f32] hover:bg-[#195a28] py-2 text-[12px] font-medium text-white shadow-sm transition"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark Deliverable as Published...
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Linked Script */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                <FileCode2 className="h-4 w-4 text-[#0071e3]" /> Linked Script
              </h3>
            </div>
            {linkedScript ? (
              <div className="space-y-1.5 text-xs">
                <div className="font-semibold text-[#1d1d1f]">{linkedScript.title}</div>
                {linkedScript.hook && (
                  <p className="text-[11px] text-[#86868b] line-clamp-2 italic">"{linkedScript.hook}"</p>
                )}
                <Link
                  href={`/projects/${projectId}/scripts?scriptId=${linkedScript.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0071e3] hover:underline pt-1"
                >
                  View / Edit Script →
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className="text-[12px] text-[#86868b] block">No script attached to this deliverable.</span>
                <Link
                  href={`/projects/${projectId}/scripts?linkDeliverableId=${item.id}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0071e3] hover:underline"
                >
                  + Create / Link Script in Library
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* COLUMN 2: Creative & Copy Presentation Canvas (5 cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-5 bg-[#ffffff] p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-7.5rem)]">
          {/* Creative Media Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[#1d1d1f] tracking-tight">
                  {isUiDesign ? "Design Asset" : "Creative Asset"}
                </h2>
                <span className="rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-medium text-[#86868b]">
                  {currentVersion.creativeAssets.length} file{currentVersion.creativeAssets.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* Top Action Buttons (shown when asset exists) */}
              {currentVersion.creativeAssets.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-[#f2f2f7] hover:bg-[#e8e8ed] text-[#1d1d1f] px-3 py-1 text-[12px] font-medium transition active:scale-[0.98]">
                    <Upload className="h-3 w-3 text-[#0071e3]" />
                    <span>Replace</span>
                    <input
                      type="file"
                      accept="image/*,video/*,application/pdf,.pdf"
                      onChange={handleCreativeFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => setIsDriveModalOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full bg-[#f2f2f7] hover:bg-[#e8e8ed] text-[#1d1d1f] px-3 py-1 text-[12px] font-medium transition active:scale-[0.98]"
                    title="Attach Cloud / Drive Link"
                  >
                    <LinkIcon className="h-3 w-3 text-[#6e6e73]" />
                    <span>Drive Link</span>
                  </button>
                </div>
              )}
            </div>

            {/* Upload Status Feedback Banners */}
            {isUploadingCreative && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0071e3]/[0.08] border border-[#0071e3]/20 text-[#0071e3] text-[13px] font-medium animate-in fade-in">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>Uploading creative asset to Cloudflare R2 storage...</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#e8f5e9] border border-[#c8e6c9] text-[#2e7d32] text-[13px] font-medium animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
                <button onClick={() => setUploadSuccess(null)} className="text-[#2e7d32] hover:opacity-70">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#fdf2f2] border border-[#fde8e8] text-[#c81e1e] text-[13px] font-medium animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Upload failed: {uploadError}</span>
                </div>
                <button onClick={() => setUploadError(null)} className="text-[#c81e1e] hover:opacity-70">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-black/[0.08] bg-[#fbfbfd] p-3 shadow-xs">
              {currentVersion.creativeAssets.length > 0 ? (
                <div className="space-y-2">
                  {currentVersion.creativeAssets[0].isDriveLink ? (
                    /* Google Drive / External Asset Preview Card */
                    <div className="rounded-xl bg-white p-6 border border-black/[0.04] text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                      <div className="mx-auto h-14 w-14 rounded-2xl bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center font-bold text-[16px] border border-[#d2e3fc]">
                        <LinkIcon className="h-7 w-7" />
                      </div>
                      <div>
                        <div className="font-semibold text-[14px] text-[#1d1d1f] truncate max-w-sm mx-auto">
                          {currentVersion.creativeAssets[0].filename}
                        </div>
                        <div className="text-[12px] text-[#86868b] mt-0.5 break-all max-w-md mx-auto truncate font-mono">
                          {currentVersion.creativeAssets[0].driveUrl}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <a
                          href={currentVersion.creativeAssets[0].driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-4 py-1.5 text-[12px] font-medium shadow-xs transition active:scale-[0.98]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Open External Link ↗
                        </a>
                      </div>
                    </div>
                  ) : currentVersion.creativeAssets[0].mimeType === "application/pdf" ||
                  currentVersion.creativeAssets[0].filename?.toLowerCase().endsWith(".pdf") ? (
                    /* PDF Document Preview Card */
                    <div className="rounded-xl bg-white p-6 border border-black/[0.04] text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                      <div className="mx-auto h-14 w-14 rounded-2xl bg-[#ffefef] text-[#d70015] flex items-center justify-center font-bold text-[16px] border border-[#ffd5d0]">
                        PDF
                      </div>
                      <div>
                        <div className="font-semibold text-[14px] text-[#1d1d1f] truncate max-w-sm mx-auto">
                          {currentVersion.creativeAssets[0].filename}
                        </div>
                        <div className="text-[12px] text-[#86868b] mt-0.5">
                          {(currentVersion.creativeAssets[0].fileSizeBytes / (1024 * 1024)).toFixed(2)} MB • Carousel Document
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <a
                          href={currentVersion.creativeAssets[0].previewUrl}
                          download={currentVersion.creativeAssets[0].filename}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-3.5 py-1.5 text-[12px] font-medium shadow-xs transition active:scale-[0.98]"
                        >
                          <Download className="h-3.5 w-3.5" /> Download PDF
                        </a>
                        <a
                          href={currentVersion.creativeAssets[0].previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f2f7] hover:bg-[#e8e8ed] text-[#1d1d1f] px-3.5 py-1.5 text-[12px] font-medium transition active:scale-[0.98]"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-[#6e6e73]" /> Preview Fullscreen
                        </a>
                      </div>
                    </div>
                  ) : (
                    /* Standard Image / Video Preview */
                    <div className="overflow-hidden rounded-xl bg-white aspect-video flex items-center justify-center border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                      <SafeImage
                        src={currentVersion.creativeAssets[0].previewUrl}
                        alt={currentVersion.creativeAssets[0].filename || "Creative Asset"}
                        fallbackTitle={currentVersion.creativeAssets[0].filename || "Creative Asset"}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between px-1.5 pt-1 text-[12px] text-[#6e6e73]">
                    <span className="font-medium truncate max-w-[200px]">
                      {currentVersion.creativeAssets[0].filename}
                    </span>
                    <div className="flex items-center gap-3">
                      <span>
                        {currentVersion.creativeAssets[0].isDriveLink
                          ? "External Cloud Link"
                          : `${(currentVersion.creativeAssets[0].fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`}
                      </span>
                      <button
                        onClick={() => handleRemoveAsset(currentVersion.creativeAssets[0].assetId)}
                        className="text-[#d70015] hover:text-[#ff3b30] flex items-center gap-1 font-medium transition"
                        title="Remove creative asset"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>

                  {item.stage === "draft" && canSubmitReview && (
                    <div className="pt-2.5 mt-2 flex items-center justify-between border-t border-black/[0.06]">
                      <span className="text-[12px] text-[#2e7d32] font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Creative work ready
                      </span>
                      <button
                        onClick={handleSubmitForReview}
                        disabled={isSubmittingForReview}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-3.5 py-1.5 text-[12px] font-medium shadow-xs transition disabled:opacity-50 active:scale-[0.98]"
                      >
                        {isSubmittingForReview ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span>Submit for Review</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Apple-style Empty Dropzone Card */
                <div className="py-9 px-6 text-center space-y-3.5 bg-white rounded-xl border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                  <div className="mx-auto h-11 w-11 rounded-2xl bg-[#0071e3]/[0.08] text-[#0071e3] flex items-center justify-center border border-[#0071e3]/10">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-[14px] text-[#1d1d1f]">No Creative Attached</h3>
                    <p className="text-[12px] text-[#86868b] max-w-xs mx-auto leading-normal">
                      Upload images (PNG, JPG), video reels (MP4, MOV), or multi-page PDF documents for Carousels.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-4 py-1.5 text-[12.5px] font-medium shadow-xs transition active:scale-[0.98]">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Choose File to Upload</span>
                      <input
                        type="file"
                        accept="image/*,video/*,application/pdf,.pdf"
                        onChange={handleCreativeFileUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => setIsDriveModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f2f7] hover:bg-[#e8e8ed] text-[#1d1d1f] px-3.5 py-1.5 text-[12.5px] font-medium transition active:scale-[0.98]"
                    >
                      <LinkIcon className="h-3.5 w-3.5 text-[#6e6e73]" />
                      <span>Attach Drive Link</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Context Section: UI Design Context vs DM Copy & Captions */}
          {isUiDesign ? (
            <div className="space-y-4">
              {/* Figma / Design Link */}
              <div className="rounded-2xl border border-black/[0.08] bg-[#fbfbfd] p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-[#0071e3]" />
                    <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Figma / Design URL</h3>
                  </div>
                  {(item.figmaUrl || detailData?.project?.masterFigmaUrl) && (
                    <a
                      href={item.figmaUrl || detailData?.project?.masterFigmaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-3.5 py-1 text-[12px] font-medium shadow-xs transition active:scale-[0.98]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open in Figma ↗
                    </a>
                  )}
                </div>
                <p className="text-[12.5px] text-[#1d1d1f] font-mono break-all bg-white p-3 rounded-xl border border-black/[0.06]">
                  {item.figmaUrl || detailData?.project?.masterFigmaUrl || "No Figma URL provided for this task."}
                </p>
              </div>

              {/* Brief / Description */}
              <div className="rounded-2xl border border-black/[0.08] bg-[#fbfbfd] p-5 shadow-xs space-y-2">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Task Brief &amp; Scope</h3>
                <p className="text-[13.5px] text-[#1d1d1f] leading-relaxed whitespace-pre-wrap">
                  {item.brief || "No detailed brief provided."}
                </p>
              </div>

              {/* Reference Links */}
              {item.referenceLink && (
                <div className="rounded-2xl border border-black/[0.08] bg-[#fbfbfd] p-5 shadow-xs space-y-2">
                  <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Reference Links</h3>
                  <a
                    href={item.referenceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-[#0071e3] hover:underline flex items-center gap-1 break-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {item.referenceLink}
                  </a>
                </div>
              )}
            </div>
          ) : (
            /* Copy / Caption Section for Digital Marketing */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-semibold text-[#1d1d1f]">Copy &amp; Captions</h2>
                {!isEditingDraft && (
                  <button
                    onClick={() => setIsEditingDraft(true)}
                    className="text-[13px] text-[#0066cc] hover:text-[#0077ed] font-medium"
                  >
                    Edit Copy / Create Revision
                  </button>
                )}
              </div>

              {isEditingDraft ? (
                <div className="space-y-4 rounded-2xl border border-black/[0.12] bg-[#fbfbfd] p-5">
                  <div>
                    <label className="block text-[13px] font-medium text-[#1d1d1f] mb-1">
                      Caption Content
                    </label>
                    <textarea
                      rows={6}
                      value={draftCaption}
                      onChange={(e) => setDraftCaption(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.12] bg-white p-3 text-[14px] text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#1d1d1f] mb-1">
                      Hashtags (space separated)
                    </label>
                    <input
                      type="text"
                      value={draftHashtags}
                      onChange={(e) => setDraftHashtags(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[14px] text-[#1d1d1f]"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#1d1d1f] mb-1">
                      Call to Action (CTA)
                    </label>
                    <input
                      type="text"
                      value={draftCTA}
                      onChange={(e) => setDraftCTA(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[14px] text-[#1d1d1f]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setIsEditingDraft(false)}
                      className="rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-4 py-1.5 text-[13px] font-medium text-[#1d1d1f]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResubmit}
                      disabled={!canResubmit}
                      className="rounded-full bg-[#0071e3] disabled:opacity-50 hover:bg-[#0077ed] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
                    >
                      Submit as New Version
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-black/[0.08] bg-[#fbfbfd] p-5 space-y-4">
                  <p className="text-[15px] text-[#1d1d1f] leading-relaxed whitespace-pre-wrap font-normal">
                    {currentVersion.copy.caption}
                  </p>

                  {currentVersion.copy.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-black/[0.06]">
                      {currentVersion.copy.hashtags.map((h) => (
                        <span
                          key={h}
                          className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[12px] font-medium text-[#0066cc]"
                        >
                          #{h}
                        </span>
                      ))}
                    </div>
                  )}

                  {currentVersion.copy.cta && (
                    <div className="text-[13px] text-[#6e6e73] font-medium">
                      CTA: <span className="text-[#1d1d1f]">{currentVersion.copy.cta}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* COLUMN 3: 3-Component Approval Matrix & Change Requests (4 cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-4 bg-[#fbfbfd] p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-7.5rem)]">
          {/* 3-Component Approval Matrix Card / Design Review Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#1d1d1f]">
                {isUiDesign ? "Design Review" : "3-Component Approval Matrix"}
              </h3>
              {approvalSummary.isOverridden && (
                <span className="status-approved rounded-full px-2 py-0.5 text-[11px] font-bold">
                  Founder Override
                </span>
              )}
            </div>

            <div className="space-y-3">
              {(isUiDesign
                ? ([{ comp: "creative", label: "Design Deliverable (UI / Assets)" }] as const)
                : ([
                    { comp: "copy", label: "Copy" },
                    { comp: "creative", label: "Creative" },
                    { comp: "posting_date", label: "Posting Date" },
                  ] as const)
              ).map(({ comp, label }) => {
                const compSummary = getComponentApprovalSummary(
                  comp as ApprovalComponentType,
                  currentVersion,
                  state.approvalDecisions
                );

                return (
                  <div
                    key={comp}
                    className="p-3.5 rounded-xl border border-black/[0.06] bg-[#fbfbfd] space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[13px] text-[#1d1d1f]">
                        {label}
                      </span>
                      {item.stage === "draft" ? (
                        <span className="rounded-full bg-[#f2f2f7] text-[#86868b] px-2 py-0.5 text-[11px] font-medium border border-black/[0.06]">
                          Draft WIP
                        </span>
                      ) : compSummary.isFullyApproved ? (
                        <span className="status-approved rounded-full px-2 py-0.5 text-[11px] font-bold">
                          Approved
                        </span>
                      ) : compSummary.hasChangesRequested ? (
                        <span className="status-changes rounded-full px-2 py-0.5 text-[11px] font-bold">
                          Changes Req
                        </span>
                      ) : (
                        <span className="status-review rounded-full px-2 py-0.5 text-[11px] font-medium">
                          Pending
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-black/[0.06]">
                        <span className="text-[#86868b]">Consultant:</span>
                        <span className="font-medium capitalize text-[#1d1d1f]">
                          {compSummary.consultant}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-black/[0.06]">
                        <span className="text-[#86868b]">Founder:</span>
                        <span className="font-medium capitalize text-[#1d1d1f]">
                          {compSummary.founder}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons for Consultant/Founder */}
                    {canApprove && (
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        {item.stage === "draft" || currentVersion.isDraft ? (
                          <span className="text-[11px] text-[#86868b] italic">
                            Actionable once submitted for review
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleDecision(comp, "approved")}
                              className="rounded-full bg-[#eaf6ed] hover:bg-[#d5eed9] text-[#1f6f32] px-3 py-1 text-[12px] font-medium transition"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleDecision(comp, "changes_requested")}
                              className="rounded-full bg-[#fff0ee] hover:bg-[#ffe0dc] text-[#b42318] px-3 py-1 text-[12px] font-medium transition"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Revoke Approval Action */}
            {canApprove && item.stage !== "draft" && !currentVersion.isDraft && (
              <div className="pt-2 border-t border-black/[0.06] text-right">
                <button
                  onClick={() => setIsRevokeModalOpen(true)}
                  className="text-[12px] text-[#86868b] hover:text-[#d70015] font-medium transition"
                >
                  Revoke Approval (Audited)
                </button>
              </div>
            )}
          </div>

          {/* Change Request Ledger Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#1d1d1f]">
                Change Requests ({itemChangeRequests.length})
              </h3>
              {canApprove && (
                <button
                  onClick={() => setIsChangeRequestModalOpen(true)}
                  className="text-[13px] text-[#0066cc] hover:text-[#0077ed] font-medium flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Request Change
                </button>
              )}
            </div>

            <div className="space-y-3">
              {itemChangeRequests.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#86868b]">
                  No change requests logged.
                </div>
              ) : (
                itemChangeRequests.map((cr) => (
                  <div
                    key={cr.id}
                    className="p-3.5 rounded-xl border border-black/[0.06] bg-[#ffffff] space-y-2 text-[13px]"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#1d1d1f] capitalize">
                        {cr.component} ({cr.priority})
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          cr.status === "resolved"
                            ? "status-approved"
                            : cr.status === "addressed"
                            ? "status-review"
                            : "status-changes"
                        }`}
                      >
                        {cr.status}
                      </span>
                    </div>

                    <p className="text-[#1d1d1f] text-[13px] font-normal leading-relaxed">
                      "{cr.requestedChange}"
                    </p>

                    {/* Designer Response Display */}
                    {cr.designerResponse && (
                      <div className="p-2.5 rounded-lg bg-[#f5f5f7] text-[12px] space-y-1">
                        <span className="font-semibold text-[#1d1d1f]">Designer Response:</span>
                        <p className="text-[#6e6e73]">{cr.designerResponse.text}</p>
                      </div>
                    )}

                    {/* Designer Response Form if open */}
                    {cr.status === "open" && canRespondToChanges && (
                      <div className="pt-2 border-t border-black/[0.06] space-y-2">
                        <input
                          type="text"
                          placeholder="Type your response to this change request..."
                          value={designerResponses[cr.id] || ""}
                          onChange={(e) =>
                            setDesignerResponses({
                              ...designerResponses,
                              [cr.id]: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-black/[0.12] p-2 text-[12px] text-[#1d1d1f]"
                        />
                        <button
                          onClick={() => handleDesignerRespond(cr.id)}
                          className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-3.5 py-1 text-[12px] font-medium text-white"
                        >
                          Submit Response
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Internal Comments Thread */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <h3 className="text-[16px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#0071e3]" /> Internal Discussion
            </h3>

            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {itemComments.filter((c) => c.visibility === "internal").length === 0 ? (
                <div className="py-4 text-center text-[12px] text-[#86868b]">
                  No internal comments yet.
                </div>
              ) : (
                itemComments
                  .filter((c) => c.visibility === "internal")
                  .map((comm) => (
                    <div key={comm.id} className="p-3 rounded-xl bg-[#f5f5f7] text-[12px] space-y-1">
                      <div className="flex justify-between font-semibold text-[#1d1d1f]">
                        <span>
                          {state.users.find((u) => u.id === comm.authorUserId)?.name || "Team Member"}
                        </span>
                        <span className="text-[10px] text-[#86868b] font-normal">
                          {formatTime(comm.createdAt)}
                        </span>
                      </div>
                      <p className="text-[#6e6e73] leading-relaxed">{comm.body}</p>
                    </div>
                  ))
              )}
            </div>

            {/* Add Comment Input */}
            <div className="flex gap-2 pt-2 border-t border-black/[0.06]">
              <input
                type="text"
                placeholder="Add internal note..."
                value={newCommentBody}
                onChange={(e) => setNewCommentBody(e.target.value)}
                className="flex-1 rounded-full border border-black/[0.12] px-3.5 py-1.5 text-[13px] text-[#1d1d1f]"
              />
              <button
                onClick={handlePostComment}
                className="rounded-full bg-[#1d1d1f] hover:bg-black px-4 py-1.5 text-[13px] font-medium text-white"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Share / Guest Link Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Generate Guest Review Link — Version {currentVersion?.versionNumber}</h3>
              <button onClick={() => setIsShareModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px] text-[#6e6e73]">
              <p>
                Creates an isolated client preview token bound to <strong>Version {currentVersion?.versionNumber}</strong>. The guest portal excludes internal comments, prior drafts, other projects, and commercial revenue.
              </p>

              <label className="flex items-center gap-2 text-[#1d1d1f]">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="rounded"
                />
                <span>Allow client to download full-resolution creative assets</span>
              </label>

              {!generatedLinkUrl ? (
                <button
                  onClick={handleGenerateShareLink}
                  className="w-full rounded-full bg-[#0071e3] hover:bg-[#0077ed] py-2 text-[14px] font-medium text-white shadow-sm"
                >
                  Generate Review Link — Version {currentVersion?.versionNumber}
                </button>
              ) : (
                <div className="space-y-2 pt-2">
                  <label className="block text-[12px] font-semibold text-[#1d1d1f]">Client Access URL:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedLinkUrl}
                      className="flex-1 rounded-xl border border-black/[0.12] bg-[#f5f5f7] p-2 text-[12px] font-mono text-[#1d1d1f]"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLinkUrl);
                        alert("Copied to clipboard!");
                      }}
                      className="rounded-xl bg-[#1d1d1f] px-3 py-2 text-[12px] font-medium text-white"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="pt-2">
                    <Link
                      href={generatedLinkUrl}
                      target="_blank"
                      className="text-[13px] text-[#0066cc] hover:underline font-medium"
                    >
                      Open in Simulated Guest Mode →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attach Drive / Cloud Asset Modal */}
      {isDriveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Attach Cloud / Drive Asset Link</h3>
              <button onClick={() => setIsDriveModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px] text-[#6e6e73]">
              <p>
                Link external high-resolution footage, Premiere/AfterEffects packages, or Google Drive asset folders.
              </p>

              <div>
                <label className="block font-semibold text-[#1d1d1f] mb-1">Google Drive or Cloud URL *</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={driveUrlInput}
                  onChange={(e) => setDriveUrlInput(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#f5f5f7] p-2.5 text-[13px] text-[#1d1d1f] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsDriveModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDriveLink}
                  disabled={!driveUrlInput.trim()}
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 px-5 py-2 text-[13px] font-medium text-white shadow-sm transition"
                >
                  Attach Asset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Founder Override Modal */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Founder Override</h3>
              <button onClick={() => setIsOverrideModalOpen(false)} className="text-[#86868b]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <p className="text-[#6e6e73]">
                Applies executive approval to advance this deliverable. A mandatory reason is recorded in the append-only audit trail.
              </p>
              <div>
                <label className="block font-semibold text-[#1d1d1f] mb-1">Mandatory Override Reason *</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Founder expedited client launch for press release..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyOverride}
                className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Approval Modal */}
      {isRevokeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#d70015]">Revoke Approval</h3>
              <button onClick={() => setIsRevokeModalOpen(false)} className="text-[#86868b]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <p className="text-[#6e6e73]">
                Reverts item status back to In Review. An audited reason must be provided.
              </p>
              <div>
                <label className="block font-semibold text-[#1d1d1f] mb-1">Reason for Revocation *</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Legal requested claim verification on slide 3..."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
              <button
                onClick={() => setIsRevokeModalOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokeApproval}
                className="rounded-full bg-[#d70015] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Revoke Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Change Request Modal */}
      {isChangeRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Log Change Request</h3>
              <button onClick={() => setIsChangeRequestModalOpen(false)} className="text-[#86868b]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Target Component</label>
                <select
                  value={crComponent}
                  onChange={(e) => setCrComponent(e.target.value as ApprovalComponentType)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                >
                  <option value="copy">Copy / Caption / CTA</option>
                  <option value="creative">Creative Asset / Media</option>
                  <option value="posting_date">Posting Date / Time</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Priority</label>
                <select
                  value={crPriority}
                  onChange={(e) => setCrPriority(e.target.value as any)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                >
                  <option value="high">High (Required for approval)</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low (Polishing)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Requested Change Description *</label>
                <textarea
                  rows={3}
                  placeholder="Describe specific changes requested from the designer..."
                  value={crText}
                  onChange={(e) => setCrText(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
              <button
                onClick={() => setIsChangeRequestModalOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                onClick={handleLogChangeRequest}
                className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Save Change Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassignment Modal (Phase 2) */}
      {isReassignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Reassign Deliverable</h3>
              <button onClick={() => setIsReassignModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!reassignUserId) {
                  alert("Please select a team member.");
                  return;
                }
                const res = await assignContentItem({
                  projectId,
                  contentItemId: item.id,
                  assigneeUserId: reassignUserId,
                  assignmentRole: reassignRole,
                  dueAt: reassignDueAt || undefined,
                  actorUserId: activeUserId,
                  reason: reassignReason.trim() || undefined,
                });
                if (res.success) {
                  setIsReassignModalOpen(false);
                } else {
                  alert(res.error || "Failed to reassign deliverable.");
                }
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">New Assignee *</label>
                <select
                  value={reassignUserId}
                  onChange={(e) => setReassignUserId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                >
                  <option value="">-- Choose Team Member --</option>
                  {projectMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.role.replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Assignment Role</label>
                <select
                  value={reassignRole}
                  onChange={(e) => setReassignRole(e.target.value as AssignmentRole)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                >
                  <option value="designer">Designer</option>
                  <option value="video_editor">Video Editor</option>
                  <option value="collaborator">Collaborator</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Submission Due Date</label>
                <input
                  type="date"
                  value={reassignDueAt ? reassignDueAt.slice(0, 10) : ""}
                  onChange={(e) => setReassignDueAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Reassignment Reason</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Workload balancing, specialized 3D skill required..."
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsReassignModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Confirm Reassignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Internal Due Date Modal */}
      {isDeadlineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Change Internal Due Date</h3>
                <p className="text-[12px] text-[#6e6e73] mt-0.5">
                  Updates authoritative internal operational deadline and active assignment.
                </p>
              </div>
              <button onClick={() => setIsDeadlineModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newDeadlineVal || !deadlineReasonVal.trim()) {
                  alert("Please provide both a new deadline date and a mandatory reason.");
                  return;
                }
                const res = await updateInternalDeadlineAction({
                  contentItemId: item.id,
                  newDueAt: new Date(newDeadlineVal).toISOString(),
                  reason: deadlineReasonVal.trim(),
                  actorUserId: activeUserId,
                });
                if (res.success) {
                  setIsDeadlineModalOpen(false);
                  await loadDetail();
                } else {
                  alert(res.error || "Failed to update internal due date.");
                }
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Internal Due Date *</label>
                <input
                  type="date"
                  value={newDeadlineVal ? newDeadlineVal.slice(0, 10) : ""}
                  onChange={(e) => setNewDeadlineVal(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Reason for Deadline Change *</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Scope expanded, additional client feedback round requested..."
                  value={deadlineReasonVal}
                  onChange={(e) => setDeadlineReasonVal(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsDeadlineModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Save Internal Due Date
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Duration Adjustment Modal (Phase 2 Admin Corrections) */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Adjust Tracked Session Time</h3>
              <button onClick={() => setIsAdjustmentModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!adjustSessionId || !adjustReason.trim()) {
                  alert("Please provide the adjusted duration and a mandatory reason.");
                  return;
                }
                const res = adjustWorkSessionDuration({
                  sessionId: adjustSessionId,
                  adjustedDurationSeconds: Math.max(0, adjustMinutes * 60),
                  reason: adjustReason.trim(),
                  actorUserId: activeUserId,
                });
                if (res.success) {
                  setIsAdjustmentModalOpen(false);
                } else {
                  alert(res.error || "Failed to adjust session duration.");
                }
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Select Work Session *</label>
                <select
                  value={adjustSessionId}
                  onChange={(e) => {
                    setAdjustSessionId(e.target.value);
                    const s = itemWorkSessions.find((ws) => ws.id === e.target.value);
                    if (s) setAdjustMinutes(Math.round(s.accumulatedSeconds / 60));
                  }}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                >
                  {itemWorkSessions.map((ws, idx) => (
                    <option key={ws.id} value={ws.id}>
                      Session #{idx + 1} ({formatDateTime(ws.startedAt)}) — {Math.round(ws.accumulatedSeconds / 60)} mins
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Adjusted Duration (Minutes) *</label>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={adjustMinutes}
                  onChange={(e) => setAdjustMinutes(Number(e.target.value) || 0)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Mandatory Reason for Adjustment *</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Designer accidentally left timer running during lunch break..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Save Audited Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Concurrency Error Alert Modal */}
      {concurrencyErrorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#1d1d1f]">Active Timer Concurrency Limit</h3>
                <p className="text-[12px] text-[#6e6e73]">
                  You can only track one active work session at a time.
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[#1d1d1f] bg-[#fbfbfd] p-3 rounded-xl border border-black/[0.06]">
              {concurrencyErrorMessage}
            </p>

            {concurrencyTaskTitle && (
              <p className="text-[12px] text-[#86868b] px-1">
                Currently tracking: <strong className="text-[#1d1d1f]">{concurrencyTaskTitle}</strong>
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.06]">
              <button
                onClick={() => {
                  setConcurrencyErrorMessage(null);
                  setConcurrencyTaskTitle(null);
                }}
                className="rounded-full bg-[#1d1d1f] hover:bg-black px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Platform Selective Sync Modal (Phase 3) */}
      {isSyncModalOpen && contentGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Apply to Linked Platform Items</h3>
                <p className="text-[12px] text-[#6e6e73]">
                  Group: &quot;{contentGroup.title}&quot; ({siblingGroupItems.length} platforms)
                </p>
              </div>
              <button onClick={() => setIsSyncModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!syncCopyCheck && !syncCreativeCheck && !syncDateCheck) {
                  alert("Please select at least one component to synchronize.");
                  return;
                }
                const res = await syncContentGroupFieldsAction({
                  contentGroupId: contentGroup.id,
                  sourceItemId: item.id,
                  syncCopy: syncCopyCheck,
                  syncCreative: syncCreativeCheck,
                  syncScheduledDate: syncDateCheck,
                  actorUserId: activeUserId,
                  reason: syncReason.trim() || undefined,
                });
                if (res.success) {
                  setIsSyncModalOpen(false);
                  await loadDetail();
                  alert(`Successfully synchronized selected components across ${(res as any).affectedItemCount ?? 0} platform items.`);
                } else {
                  alert(res.error || "Failed to synchronize platform items.");
                }
              }}
              className="space-y-4 text-[13px]"
            >
              <div className="space-y-2.5 bg-[#fbfbfd] p-3.5 rounded-xl border border-black/[0.06]">
                <span className="text-[12px] font-semibold text-[#1d1d1f] block">Select Components to Propagate:</span>
                
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncCopyCheck}
                    onChange={(e) => setSyncCopyCheck(e.target.checked)}
                    className="mt-0.5 rounded border-black/[0.2]"
                  />
                  <div>
                    <span className="font-medium text-[#1d1d1f] block">Copy / Caption & CTA</span>
                    <span className="text-[11px] text-[#86868b]">
                      Propagates caption, hashtags, and CTA. Selectively resets Copy approval on target items.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncCreativeCheck}
                    onChange={(e) => setSyncCreativeCheck(e.target.checked)}
                    className="mt-0.5 rounded border-black/[0.2]"
                  />
                  <div>
                    <span className="font-medium text-[#1d1d1f] block">Creative Media Assets</span>
                    <span className="text-[11px] text-[#86868b]">
                      Shares physical asset references (no duplicate files). Selectively resets Creative approval.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncDateCheck}
                    onChange={(e) => setSyncDateCheck(e.target.checked)}
                    className="mt-0.5 rounded border-black/[0.2]"
                  />
                  <div>
                    <span className="font-medium text-[#1d1d1f] block">Scheduled Release Date</span>
                    <span className="text-[11px] text-[#86868b]">
                      Syncs planned release date. Selectively resets Posting Date approval.
                    </span>
                  </div>
                </label>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Audit Reason for Propagation</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Master creative revision approved by client, propagating to Instagram and Facebook..."
                  value={syncReason}
                  onChange={(e) => setSyncReason(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Synchronize Platforms
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Published Modal (Phase 3) */}
      {isMarkPublishedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Confirm Deliverable Publication</h3>
              <button onClick={() => setIsMarkPublishedModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!publishLiveUrlInput.trim()) {
                  alert("Please enter the live URL.");
                  return;
                }
                markPublished({
                  contentItemId: item.id,
                  submissionVersionId: currentVersion.id,
                  liveUrl: publishLiveUrlInput.trim(),
                  publishedAt: publishDateInput ? new Date(publishDateInput).toISOString() : new Date().toISOString(),
                  actorUserId: activeUserId,
                });
                setIsMarkPublishedModalOpen(false);
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Live Published URL *</label>
                <input
                  type="url"
                  placeholder="https://instagram.com/p/... or https://linkedin.com/posts/..."
                  value={publishLiveUrlInput}
                  onChange={(e) => setPublishLiveUrlInput(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Actual Live Publication Timestamp</label>
                <input
                  type="datetime-local"
                  value={publishDateInput}
                  onChange={(e) => setPublishDateInput(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
                <span className="text-[11px] text-[#86868b] mt-1 block">
                  Original planned date ({formatDate(item.deadlines.scheduledPublicationDate)}) will be preserved in schedule history.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsMarkPublishedModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#1f6f32] hover:bg-[#195a28] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Mark as Published
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Publication Details Modal (Phase 3 Audited Corrections) */}
      {isEditPublicationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Edit Canonical Publication Details</h3>
              <button onClick={() => setIsEditPublicationModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editPublicationReason.trim()) {
                  alert("Please provide a mandatory reason for updating publication details.");
                  return;
                }
                const res = await updatePublicationDetails({
                  contentItemId: item.id,
                  publishedAt: editPublishedDateInput ? new Date(editPublishedDateInput).toISOString() : undefined,
                  liveUrl: editLiveUrlInput.trim() || undefined,
                  reason: editPublicationReason.trim(),
                  actorUserId: activeUserId,
                });
                if (res.success) {
                  setIsEditPublicationModalOpen(false);
                } else {
                  alert(res.error || "Failed to update publication details.");
                }
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Canonical Live Date & Time *</label>
                <input
                  type="datetime-local"
                  value={editPublishedDateInput}
                  onChange={(e) => setEditPublishedDateInput(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Live URL</label>
                <input
                  type="url"
                  value={editLiveUrlInput}
                  onChange={(e) => setEditLiveUrlInput(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Mandatory Reason for Correction *</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Correcting publication timestamp to match actual Meta API broadcast time..."
                  value={editPublicationReason}
                  onChange={(e) => setEditPublicationReason(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsEditPublicationModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Save Audited Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Deliverable Modal */}
      {item && (
        <DeleteDeliverableModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          item={{
            id: item.id,
            title: item.title,
            platform: item.platform,
            contentGroupId: item.contentGroupId,
            stage: item.stage,
          }}
          hasSiblings={Boolean(
            item.contentGroupId &&
            state.contentItems.filter(
              (i) => i.contentGroupId === item.contentGroupId && i.id !== item.id && !i.deletedAt
            ).length > 0
          )}
          onDeleted={() => {
            router.push(`/projects/${projectId}`);
          }}
        />
      )}
    </div>
  );
}
