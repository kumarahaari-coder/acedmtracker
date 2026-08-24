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
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  History,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import {
  ApprovalComponentType,
  ComponentDecision,
  ContentItem,
  SubmissionVersion,
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
    generateExternalReviewLink,
  } = useAppState();

  const {
    activeRole,
    activeUserId,
    canApprove,
    canOverride,
    canRespondToChanges,
    canUploadCreative,
    canManageWorkflow,
  } = useRole();

  const project = state.projects.find((p) => p.id === projectId);
  const item = state.contentItems.find((i) => i.id === itemId);

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
        role: m.role,
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
          {/* Share with Client Link Generator */}
          <button
            onClick={() => {
              setGeneratedLinkUrl("");
              setIsShareModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition"
          >
            <Share2 className="h-3.5 w-3.5" /> Client Preview Link
          </button>

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

          {/* Assigned Designer / Accountable Owner */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[#0071e3]" /> Assigned Designer
              </h3>
              <span className="text-[11px] font-medium text-[#0071e3] capitalize bg-[#f0f7ff] px-2 py-0.5 rounded-full border border-[#d0e5ff]">
                {assignedMember?.role || "Designer"}
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
                  {assignedMember?.email || "No email on record"}
                </div>
              </div>
            </div>

            {(canManageWorkflow || activeRole === "founder" || activeRole === "consultant" || activeRole === "admin") && (
              <div className="pt-2 border-t border-black/[0.06] space-y-1">
                <label className="block text-[11px] font-medium text-[#86868b]">Reassign To:</label>
                <select
                  value={item.accountableOwnerId || ""}
                  onChange={(e) => {
                    if (e.target.value && e.target.value !== item.accountableOwnerId) {
                      assignContentItem({
                        contentItemId: item.id,
                        assigneeUserId: e.target.value,
                        actorUserId: activeUserId,
                      });
                    }
                  }}
                  className="w-full bg-[#f5f5f7] border border-black/[0.08] rounded-xl p-2 text-[12px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                >
                  {projectMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.role.replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Operational Deadlines */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <h3 className="text-[13px] font-semibold text-[#1d1d1f]">Operational Deadlines</h3>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#86868b]">Submission Due</span>
                <span className="font-medium text-[#1d1d1f]">
                  {formatDate(item.deadlines.submissionDeadline)}
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
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#1d1d1f]">Creative Asset</h2>
              <span className="text-[12px] text-[#86868b]">
                {currentVersion.creativeAssets.length} file(s) attached
              </span>
            </div>

            <div className="rounded-2xl border border-black/[0.08] bg-[#f5f5f7] p-2 overflow-hidden shadow-sm">
              {currentVersion.creativeAssets.length > 0 ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-xl bg-white aspect-video flex items-center justify-center border border-black/[0.06]">
                    <SafeImage
                      src={currentVersion.creativeAssets[0].previewUrl}
                      alt={currentVersion.creativeAssets[0].filename || "Creative Asset"}
                      fallbackTitle={currentVersion.creativeAssets[0].filename || "Creative Asset"}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between px-2 py-1 text-[12px] text-[#6e6e73]">
                    <span className="font-medium truncate max-w-xs">
                      {currentVersion.creativeAssets[0].filename}
                    </span>
                    <span>
                      {(currentVersion.creativeAssets[0].fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-[13px] text-[#86868b]">
                  No creative file uploaded for this version.
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
    </div>
  );
}
