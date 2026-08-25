"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  CheckCircle2,
  ChevronRight,
  Filter,
  Layers,
  Plus,
  Sparkles,
  X,
  FileCheck2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { formatDate } from "@/lib/formatters";
import { ContentPlatform, ContentType, ScopeClassification } from "@/lib/types";

export default function ApprovalsQueuePage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, createContentItem, submitVersion } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const isManagement = activeRole === "founder" || activeRole === "consultant" || activeRole === "admin";

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "changes_requested" | "approved">("pending");

  // Fast-track Add Creative for Review Modal (Management Only)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPlatform, setNewPlatform] = useState<ContentPlatform>("Instagram");
  const [newType, setNewType] = useState<ContentType>("carousel");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newAssigneeId, setNewAssigneeId] = useState("u_designer1");
  const [newCaption, setNewCaption] = useState("");

  const project = state.projects.find((p) => p.id === projectId);
  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  const projectMembers = state.projectMemberships
    .filter((m) => m.projectId === projectId && m.status === "active")
    .map((m) => {
      const user = state.users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        name: user?.name || m.userId,
        role: m.membershipRole || user?.role || "designer",
      };
    });

  const filteredItems = projectItems.filter((item) => {
    const version = state.submissionVersions.find(
      (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
    );
    const summary = getItemApprovalMatrixSummary(
      item,
      version,
      state.approvalDecisions,
      state.founderOverrides
    );

    if (statusFilter === "pending") return !summary.allComponentsApproved && !summary.anyChangesRequested;
    if (statusFilter === "changes_requested") return summary.anyChangesRequested;
    if (statusFilter === "approved") return summary.allComponentsApproved;
    return true;
  });

  const handleAddDirectForReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const initialCopy = {
      caption: newCaption || `Creative brief and copy for ${newTitle.trim()}`,
      hashtags: ["marketing", "growth"],
      cta: "Learn more",
    };

    const created = createContentItem(
      {
        projectId,
        title: newTitle.trim(),
        platform: newPlatform,
        contentType: newType,
        stage: "in_review",
        accountableOwnerId: newAssigneeId,
        collaboratorIds: [],
        deadlines: {
          submissionDeadline: newDate,
          scheduledPublicationDate: newDate,
        },
        scopeClassification: "contracted",
      },
      initialCopy
    );

    if (created.activeDraftVersionId) {
      submitVersion(created.activeDraftVersionId, activeUserId);
    }

    setIsAddModalOpen(false);
    setNewTitle("");
    setNewCaption("");
    setStatusFilter("pending");
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Approvals Queue
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Review 3-component status (Copy, Creative, Posting Date) across project deliverables.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Fast-track review creation button for management */}
          {isManagement && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition"
            >
              <Plus className="h-4 w-4" /> Add Creative for Review
            </button>
          )}

          {/* Filter */}
          <div className="flex items-center gap-1 bg-[#ffffff] border border-black/[0.08] rounded-full p-1 shadow-sm text-[13px]">
            <button
              onClick={() => setStatusFilter("pending")}
              className={`px-3.5 py-1 rounded-full font-medium transition ${
                statusFilter === "pending" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              Needs Decision
            </button>
            <button
              onClick={() => setStatusFilter("changes_requested")}
              className={`px-3.5 py-1 rounded-full font-medium transition ${
                statusFilter === "changes_requested" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              Changes Req
            </button>
            <button
              onClick={() => setStatusFilter("approved")}
              className={`px-3.5 py-1 rounded-full font-medium transition ${
                statusFilter === "approved" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3.5 py-1 rounded-full font-medium transition ${
                statusFilter === "all" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Approvals Table */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="divide-y divide-black/[0.06]">
          {filteredItems.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-[#f2f2f7] flex items-center justify-center text-[#86868b]">
                <FileCheck2 className="h-6 w-6" />
              </div>
              <h3 className="text-[16px] font-semibold text-[#1d1d1f]">No Content in Queue</h3>
              <p className="text-[13px] text-[#86868b] max-w-md mx-auto">
                No deliverables are currently awaiting review under the '{statusFilter.replace("_", " ")}' filter. Content appears here automatically after being formally submitted by a designer.
              </p>
              {isManagement && (
                <div className="pt-2">
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
                  >
                    <Plus className="h-4 w-4" /> Add Creative for Review
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredItems.map((item) => {
              const version = state.submissionVersions.find(
                (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
              );
              const summary = getItemApprovalMatrixSummary(
                item,
                version,
                state.approvalDecisions,
                state.founderOverrides
              );

              const getBadgeStyle = (isApproved: boolean, hasChanges: boolean) => {
                if (isApproved) return "bg-[#eaf6ed] text-[#1f6f32] border-[#ceead6]";
                if (hasChanges) return "bg-[#fff0ee] text-[#d70015] border-[#ffd5d0]";
                return "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]";
              };

              const renderBadge = (label: string, comp: typeof summary.copy) => {
                const style = getBadgeStyle(comp.isFullyApproved, comp.hasChangesRequested);
                const text = comp.isFullyApproved ? "✓ Approved" : comp.hasChangesRequested ? "✕ Changes" : "● Pending";
                return (
                  <span className={`px-2 py-0.5 rounded-full border ${style}`}>
                    {label}: {text}
                  </span>
                );
              };

              return (
                <div
                  key={item.id}
                  className="p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#f5f5f7]/60 transition"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-semibold text-[#1d1d1f]">
                        {item.platform} • {item.contentType}
                      </span>
                      <Link
                        href={`/projects/${projectId}/content/${item.id}`}
                        className="font-semibold text-[15px] text-[#1d1d1f] hover:text-[#0071e3] truncate"
                      >
                        {item.title}
                      </Link>
                    </div>
                    <div className="text-[12px] text-[#86868b] flex items-center gap-2">
                      <span>Version {item.currentVersionNumber}</span>
                      <span>•</span>
                      <span>Scheduled: {formatDate(item.deadlines.scheduledPublicationDate)}</span>
                      {item.scopeClassification === "goodwill" && (
                        <span className="text-[#1f6f32] font-semibold">• Goodwill Extra</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                    {/* 3-Component Matrix Badges */}
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      {renderBadge("Copy", summary.copy)}
                      {renderBadge("Creative", summary.creative)}
                      {renderBadge("Date", summary.posting_date)}
                    </div>

                    <Link
                      href={`/projects/${projectId}/content/${item.id}`}
                      className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition inline-flex items-center gap-1"
                    >
                      Review <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Creative for Review Modal (Management only) */}
      {isAddModalOpen && isManagement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Fast-Track Creative for Review</h3>
                <p className="text-[12px] text-[#86868b]">Instantly creates deliverable and places it in the review queue</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-full p-1 text-[#86868b] hover:text-[#1d1d1f]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddDirectForReview} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Deliverable Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Testimonial Carousel: Patient Recovery Story"
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                    Platform
                  </label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value as ContentPlatform)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="Facebook">Facebook</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="YouTube">YouTube</option>
                    <option value="X">X</option>
                    <option value="Email">Email</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                    Content Type
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as ContentType)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
                  >
                    <option value="post">Standard Post</option>
                    <option value="carousel">Carousel (PDF/Slides)</option>
                    <option value="reel">Reel / Short</option>
                    <option value="trial_reel">Trial Reel</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                    Scheduled Publication Date
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                    Assignee / Creator
                  </label>
                  <select
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
                  >
                    {projectMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Draft Copy / Caption
                </label>
                <textarea
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Enter initial draft caption or review notes..."
                  rows={3}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-3 text-[13px] text-[#1d1d1f] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
                >
                  Create &amp; Submit for Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
