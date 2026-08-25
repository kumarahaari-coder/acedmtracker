"use client";

import React, { useState } from "react";
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
} from "lucide-react";
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

export default function ContentItemWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || "proj_acme";
  const itemId = (params?.itemId as string) || "item_acme_1";

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
    acceptContentAssignment,
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

  const project = state.projects.find((p) => p.id === projectId);
  const item = state.contentItems.find((i) => i.id === itemId);

  // Multi-Platform Content Group (Phase 3)
  const contentGroup = item?.contentGroupId
    ? state.contentGroups.find((g) => g.id === item.contentGroupId)
    : undefined;
  const siblingGroupItems = item?.contentGroupId
    ? state.contentItems.filter((i) => i.contentGroupId === item.contentGroupId)
    : [];

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
  const activeAssignment = state.contentAssignments.find(
    (a) => a.contentItemId === itemId && a.status !== "reassigned"
  );
  const itemWorkSessions = state.workSessions.filter((ws) => ws.contentItemId === itemId);
  const currentActiveSession = itemWorkSessions.find(
    (ws) => ws.userId === activeUserId && ws.status === "active"
  );
  const currentPausedSession = itemWorkSessions.find(
    (ws) => ws.userId === activeUserId && ws.status === "paused"
  );

  // Live timer tick state
  const [ticker, setTicker] = useState(0);
  React.useEffect(() => {
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

  // Versions for this item
  const itemVersions = state.submissionVersions.filter(
    (v) => v.contentItemId === itemId
  );

  const [selectedVersionId, setSelectedVersionId] = useState<string>(() => {
    return item?.latestSubmittedVersionId || item?.activeDraftVersionId || itemVersions[0]?.id || "";
  });

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

  // Designer Response Draft state
  const [designerResponses, setDesignerResponses] = useState<Record<string, string>>({});

  // Internal Comments Draft state
  const [newCommentBody, setNewCommentBody] = useState("");

  // New Draft Editing State
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftCaption, setDraftCaption] = useState(currentVersion?.copy.caption || "");
  const [draftHashtags, setDraftHashtags] = useState(currentVersion?.copy.hashtags.join(" ") || "");
  const [draftCTA, setDraftCTA] = useState(currentVersion?.copy.cta || "");

  if (!item || !project || !currentVersion) {
    return (
      <div className="p-12 text-center text-[#86868b]">
        Content deliverable not found.
      </div>
    );
  }

  // Approval Matrix Summary
  const approvalSummary = getItemApprovalMatrixSummary(
    item,
    currentVersion,
    state.approvalDecisions,
    state.founderOverrides
  );

  // Change Requests for this item
  const itemChangeRequests = state.changeRequests.filter(
    (cr) => cr.contentItemId === item.id
  );
  const unaddressedOpenRequests = itemChangeRequests.filter(
    (cr) => cr.status === "open" && !cr.designerResponse
  );
  const canResubmit = unaddressedOpenRequests.length === 0;

  // Comments for this item (Internal + External)
  const itemComments = state.comments.filter((c) => c.contentItemId === item.id);

  // Handlers
  const handleDecision = (
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
  };

  const handleApplyOverride = () => {
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
    setIsOverrideModalOpen(false);
    setOverrideReason("");
  };

  const handleRevokeApproval = () => {
    if (!revokeReason.trim()) {
      alert("A mandatory reason is required to revoke an approval.");
      return;
    }
    // Find active decision by this reviewer to revoke
    const activeDec = state.approvalDecisions.find(
      (d) => d.submissionVersionId === currentVersion.id && d.reviewerUserId === activeUserId
    );
    if (activeDec) {
      revokeApprovalDecision(activeDec.id, revokeReason.trim(), activeUserId);
    }
    setIsRevokeModalOpen(false);
    setRevokeReason("");
  };

  const handleLogChangeRequest = () => {
    if (!crText.trim()) return;
    const reviewerName =
      state.users.find((u) => u.id === activeUserId)?.name ||
      (activeRole === "founder" ? "Vikram Shah" : "Priyah Sharma");

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

    recordApprovalDecision({
      contentItemId: item.id,
      submissionVersionId: currentVersion.id,
      component: crComponent,
      reviewerUserId: activeUserId,
      reviewerRole: activeRole === "founder" ? "founder" : "consultant",
      decision: "changes_requested",
      note: crText.trim(),
    });

    setIsChangeRequestModalOpen(false);
    setCrText("");
  };

  const handleDesignerRespond = (crId: string) => {
    const text = designerResponses[crId];
    if (!text?.trim()) return;
    respondToChangeRequest(crId, text.trim());
  };

  const handleResubmit = () => {
    if (!canResubmit) {
      alert("Cannot resubmit while open change requests remain without a designer response.");
      return;
    }

    try {
      // Create draft version, update it, and resubmit
      const draft = createDraftVersion(item.id, currentVersion.id);
      updateDraftVersion(draft.id, {
        copy: {
          caption: draftCaption,
          hashtags: draftHashtags.split(" ").filter((h) => h.trim().length > 0),
          cta: draftCTA,
        },
      });

      const res = resubmitItemVersion({
        contentItemId: item.id,
        draftVersionId: draft.id,
        actorUserId: activeUserId,
      });

      if (res.success) {
        setSelectedVersionId(draft.id);
        setIsEditingDraft(false);
      } else {
        alert(res.error || "Failed to resubmit.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to resubmit.");
    }
  };

  const handleGenerateShareLink = () => {
    const link = generateExternalReviewLink({
      projectId,
      contentItemId: item.id,
      submissionVersionId: currentVersion.id,
      createdByUserId: activeUserId,
      allowDownload,
      expiresInDays: 7,
    });
    const url = `${window.location.origin}/guest/review/${link.demoToken}`;
    setGeneratedLinkUrl(url);
  };

  const handleCreativeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = (event.target?.result as string) || "";
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const newAsset = {
        assetId: "ast_" + Math.random().toString(36).substr(2, 9),
        filename: file.name,
        previewUrl: dataUrl,
        fileSizeBytes: file.size,
        mimeType: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
        contentHash: "hash_" + Math.random().toString(36).substr(2, 9),
      };

      updateDraftVersion(currentVersion.id, {
        creativeAssets: [newAsset, ...(currentVersion.creativeAssets || [])],
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAsset = (assetId: string) => {
    updateDraftVersion(currentVersion.id, {
      creativeAssets: (currentVersion.creativeAssets || []).filter((a) => a.assetId !== assetId),
    });
  };

  const handleAddDriveLink = () => {
    if (!driveUrlInput.trim()) return;
    const newAsset = {
      assetId: "ast_" + Math.random().toString(36).substr(2, 9),
      filename: "External Cloud Asset Package",
      previewUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
      fileSizeBytes: 20 * 1024 * 1024,
      mimeType: "application/octet-stream",
      contentHash: "hash_" + Math.random().toString(36).substr(2, 9),
      isDriveLink: true,
      driveUrl: driveUrlInput.trim(),
    };
    updateDraftVersion(currentVersion.id, {
      creativeAssets: [newAsset, ...(currentVersion.creativeAssets || [])],
    });
    setDriveUrlInput("");
    setIsDriveModalOpen(false);
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

  const linkedScript = state.scripts.find((s) => s.projectId === projectId);

  const projectMembers = state.projectMemberships
    .filter((m) => m.projectId === projectId)
    .map((m) => {
      const user = state.users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        role: m.membershipRole || user?.role || "designer",
        name: user?.name || m.userId,
        email: user?.email || "",
        avatar: user?.avatar || "U",
      };
    });

  const assignedMember = projectMembers.find((m) => m.userId === item.accountableOwnerId);

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
                {item.platform} • {item.contentType}
              </span>
              <h1 className="text-[17px] font-semibold text-[#1d1d1f] truncate max-w-md">
                {item.title}
              </h1>
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
              <Share2 className="h-3.5 w-3.5" /> Client Preview Link
            </button>
          )}

          {/* Primary Action Button */}
          {approvalSummary.allComponentsApproved ? (
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
            <span className="status-review rounded-full px-3.5 py-1.5 text-[13px] font-medium">
              In Review ({approvalSummary.approvedCount}/3 Approved)
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
                  onClick={() =>
                    setClientVisibility({
                      contentItemId: item.id,
                      clientVisible: !item.clientVisible,
                      actorUserId: activeUserId,
                      reason: `Toggled client visibility to ${!item.clientVisible ? "ON" : "OFF"}`,
                    })
                  }
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
              <div className="h-8 w-8 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold flex items-center justify-center text-[12px] border border-black/[0.06] shrink-0">
                {assignedMember?.avatar || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[#1d1d1f] text-[13px] truncate">
                  {assignedMember?.name || "Unassigned"}
                </div>
                <div className="text-[11px] text-[#86868b] truncate">
                  Role: {activeAssignment?.assignmentRole || assignedMember?.role || "Designer"}
                </div>
              </div>
            </div>

            {/* Accept assignment action for assignee */}
            {((activeAssignment?.status === "assigned" && (activeAssignment.assigneeUserId === activeUserId || !activeAssignment.assigneeUserId)) ||
              (!activeAssignment && (item.accountableOwnerId === activeUserId || item.collaboratorIds.includes(activeUserId)))) && (
              <button
                onClick={() => {
                  const targetAsgnId = activeAssignment?.id || ("asgn_" + Math.random().toString(36).substr(2, 9));
                  acceptContentAssignment(targetAsgnId, activeUserId);
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] py-2 text-[12px] font-medium text-white shadow-sm transition"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Accept Deliverable Assignment
              </button>
            )}

            {/* Start Work action for accepted assignee */}
            {((activeAssignment?.status === "accepted" || (!activeAssignment && item.accountableOwnerId === activeUserId)) &&
              (activeAssignment?.assigneeUserId === activeUserId || item.accountableOwnerId === activeUserId) &&
              !currentActiveSession) && (
              <button
                onClick={() => {
                  const res = startWorkSession({
                    projectId,
                    contentItemId: item.id,
                    assignmentId: activeAssignment?.id || "",
                    userId: activeUserId,
                  });
                  if (!res.success && res.error) {
                    setConcurrencyErrorMessage(res.error);
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#1f6f32] hover:bg-[#195a28] py-2 text-[12px] font-medium text-white shadow-sm transition"
              >
                <Play className="h-3.5 w-3.5" /> Start Work (Start Timer)
              </button>
            )}

            {/* Management Actions: Reassign & Edit Deadline */}
            {(activeRole === "founder" || activeRole === "consultant" || activeRole === "admin" || canManageWorkflow) && (
              <div className="pt-2 border-t border-black/[0.06] flex items-center gap-2">
                <button
                  onClick={() => {
                    setReassignUserId(activeAssignment?.assigneeUserId || item.accountableOwnerId || "");
                    setReassignRole(activeAssignment?.assignmentRole || "designer");
                    setReassignDueAt(activeAssignment?.currentDueAt || item.deadlines.submissionDeadline || "");
                    setReassignReason("");
                    setIsReassignModalOpen(true);
                  }}
                  className="flex-1 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] py-1.5 text-[12px] font-medium text-[#1d1d1f] border border-black/[0.06] transition text-center"
                >
                  Reassign...
                </button>
                <button
                  onClick={() => {
                    setNewDeadlineVal(activeAssignment?.currentDueAt || item.deadlines.submissionDeadline || "");
                    setDeadlineReasonVal("");
                    setIsDeadlineModalOpen(true);
                  }}
                  className="flex-1 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] py-1.5 text-[12px] font-medium text-[#1d1d1f] border border-black/[0.06] transition text-center"
                >
                  Edit Due Date
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
                      onClick={() => pauseWorkSession(currentActiveSession.id, activeUserId)}
                      className="p-2 rounded-lg bg-[#fff8e6] text-[#9a6700] hover:bg-[#ffe082] transition"
                      title="Pause Timer"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => stopWorkSession(currentActiveSession.id, activeUserId)}
                      className="p-2 rounded-lg bg-[#fff0ee] text-[#b42318] hover:bg-[#ffd5d0] transition"
                      title="Stop & Complete Session"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  </>
                ) : currentPausedSession ? (
                  <>
                    <button
                      onClick={() => {
                        const res = resumeWorkSession(currentPausedSession.id, activeUserId);
                        if (!res.success && res.error) {
                          setConcurrencyErrorMessage(res.error);
                        }
                      }}
                      className="p-2 rounded-lg bg-[#eaf6ed] text-[#1f6f32] hover:bg-[#ceead6] transition"
                      title="Resume Timer"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => stopWorkSession(currentPausedSession.id, activeUserId)}
                      className="p-2 rounded-lg bg-[#fff0ee] text-[#b42318] hover:bg-[#ffd5d0] transition"
                      title="Stop Session"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  (activeRole === "designer" || activeAssignment?.assigneeUserId === activeUserId || canAdmin) && (
                    <button
                      onClick={() => {
                        if (!activeAssignment) {
                          alert("Please assign this deliverable before starting time tracking.");
                          return;
                        }
                        const res = startWorkSession({
                          projectId,
                          contentItemId: item.id,
                          assignmentId: activeAssignment.id,
                          userId: activeUserId,
                        });
                        if (!res.success && res.error) {
                          setConcurrencyErrorMessage(res.error);
                        }
                      }}
                      className="flex items-center gap-1 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] text-white px-3 py-1.5 text-[12px] font-medium transition shadow-sm"
                    >
                      <Play className="h-3 w-3" /> Start Task Timer
                    </button>
                  )
                )}
              </div>
            </div>

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
                <span className="text-[#86868b]">Initial Due</span>
                <span className="font-medium text-[#1d1d1f]">
                  {formatDate(activeAssignment?.initialDueAt || item.deadlines.submissionDeadline)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#86868b]">Current Due</span>
                <span className="font-semibold text-[#1d1d1f]">
                  {formatDate(activeAssignment?.currentDueAt || item.deadlines.submissionDeadline)}
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
            <h3 className="text-[13px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
              <FileCode2 className="h-4 w-4 text-[#0071e3]" /> Linked Script
            </h3>
            {linkedScript ? (
              <Link
                href={`/projects/${projectId}/scripts`}
                className="block text-[13px] text-[#0066cc] hover:underline font-medium"
              >
                View Structured Video Script →
              </Link>
            ) : (
              <span className="text-[12px] text-[#86868b]">No script attached.</span>
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
                <h2 className="text-[15px] font-semibold text-[#1d1d1f] tracking-tight">Creative Asset</h2>
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

            <div className="rounded-2xl border border-black/[0.08] bg-[#fbfbfd] p-3 shadow-xs">
              {currentVersion.creativeAssets.length > 0 ? (
                <div className="space-y-2">
                  {currentVersion.creativeAssets[0].mimeType === "application/pdf" ||
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
                        {(currentVersion.creativeAssets[0].fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
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

          {/* Copy / Caption Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#1d1d1f]">Copy & Captions</h2>
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
        </div>

        {/* ======================================================== */}
        {/* COLUMN 3: 3-Component Approval Matrix & Change Requests (4 cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-4 bg-[#fbfbfd] p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-7.5rem)]">
          {/* 3-Component Approval Matrix Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#1d1d1f]">
                3-Component Approval Matrix
              </h3>
              {approvalSummary.isOverridden && (
                <span className="status-approved rounded-full px-2 py-0.5 text-[11px] font-bold">
                  Founder Override
                </span>
              )}
            </div>

            <div className="space-y-3">
              {(["copy", "creative", "posting_date"] as ApprovalComponentType[]).map((comp) => {
                const compSummary = getComponentApprovalSummary(
                  comp,
                  currentVersion,
                  state.approvalDecisions
                );

                return (
                  <div
                    key={comp}
                    className="p-3.5 rounded-xl border border-black/[0.06] bg-[#fbfbfd] space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[13px] text-[#1d1d1f] capitalize">
                        {comp.replace("_", " ")}
                      </span>
                      {compSummary.isFullyApproved ? (
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Revoke Approval Action */}
            {canApprove && (
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
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Generate Guest Review Link</h3>
              <button onClick={() => setIsShareModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px] text-[#6e6e73]">
              <p>
                Creates an isolated client preview token. The guest portal excludes internal comments, prior drafts, other projects, and commercial revenue.
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
                  Generate Shareable Link
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
              onSubmit={(e) => {
                e.preventDefault();
                if (!reassignUserId) {
                  alert("Please select a team member.");
                  return;
                }
                const res = assignContentItem({
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

      {/* Edit Deadline Modal (Phase 2) */}
      {isDeadlineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Adjust Submission Deadline</h3>
              <button onClick={() => setIsDeadlineModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newDeadlineVal || !deadlineReasonVal.trim()) {
                  alert("Please provide both a new deadline date and a mandatory reason.");
                  return;
                }
                if (!activeAssignment) {
                  alert("No active assignment found for this deliverable.");
                  return;
                }
                const res = updateAssignmentDeadline({
                  assignmentId: activeAssignment.id,
                  newDueAt: new Date(newDeadlineVal).toISOString(),
                  reason: deadlineReasonVal.trim(),
                  actorUserId: activeUserId,
                });
                if (res.success) {
                  setIsDeadlineModalOpen(false);
                } else {
                  alert(res.error || "Failed to update deadline.");
                }
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">New Submission Due Date *</label>
                <input
                  type="date"
                  value={newDeadlineVal ? newDeadlineVal.slice(0, 10) : ""}
                  onChange={(e) => setNewDeadlineVal(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Reason for Deadline Adjustment *</label>
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
                  Save New Due Date
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

            <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.06]">
              <button
                onClick={() => setConcurrencyErrorMessage(null)}
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
              onSubmit={(e) => {
                e.preventDefault();
                if (!syncCopyCheck && !syncCreativeCheck && !syncDateCheck) {
                  alert("Please select at least one component to synchronize.");
                  return;
                }
                const res = syncContentGroupFields({
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
                  alert(`Successfully synchronized selected components across ${res.affectedItemCount} platform items.`);
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
              onSubmit={(e) => {
                e.preventDefault();
                if (!editPublicationReason.trim()) {
                  alert("Please provide a mandatory reason for updating publication details.");
                  return;
                }
                const res = updatePublicationDetails({
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
    </div>
  );
}
