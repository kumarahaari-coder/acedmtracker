"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  GanttChart,
  Trello,
  X,
} from "lucide-react";
import { ContentItem, ContentStage } from "@/lib/types";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { formatDate } from "@/lib/formatters";

export default function KanbanPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, updateContentItem } = useAppState();
  const { activeRole, canManageWorkflow, canApprove } = useRole();

  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("kanban");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const projectItems = state.contentItems.filter((i) => {
    const matchesProj = i.projectId === projectId;
    const matchesPlatform = platformFilter === "all" || i.platform === platformFilter;
    return matchesProj && matchesPlatform;
  });

  const columns: { stage: ContentStage; title: string }[] = [
    { stage: "draft", title: "1. Drafting" },
    { stage: "submitted", title: "2. Submitted" },
    { stage: "in_review", title: "3. In Review" },
    { stage: "changes_requested", title: "4. Changes Requested" },
    { stage: "approved", title: "5. Approved" },
    { stage: "scheduled", title: "6. Scheduled" },
    { stage: "published", title: "7. Published" },
  ];

  const handleStageTransition = (itemId: string, targetStage: ContentStage) => {
    setTransitionError(null);
    const item = state.contentItems.find((i) => i.id === itemId);
    if (!item) return;

    if (item.stage === targetStage) return;

    const latestVersion = state.submissionVersions.find(
      (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
    );
    const approvalSummary = getItemApprovalMatrixSummary(
      item,
      latestVersion,
      state.approvalDecisions,
      state.founderOverrides
    );

    // Approval gate checks
    if ((targetStage === "approved" || targetStage === "scheduled" || targetStage === "published") && !approvalSummary.allComponentsApproved) {
      setTransitionError(
        `Cannot move '${item.title}' to ${targetStage.toUpperCase()}: Gated by approval workflow. All 3 components (Copy, Creative, Posting Date) must be approved by both Consultant and Founder, or Founder Override must be applied.`
      );
      return;
    }

    if (targetStage === "published" && !item.liveUrl) {
      setTransitionError(
        `Cannot mark '${item.title}' as Published: A valid Live Post URL is required.`
      );
      return;
    }

    updateContentItem(itemId, { stage: targetStage }, `Stage moved to ${targetStage.toUpperCase()}`);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStage: ContentStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggedItemId;
    if (id) {
      handleStageTransition(id, targetStage);
    }
    setDraggedItemId(null);
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Workflow Pipeline
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Track delivery stages, drag-and-drop workflow updates, and milestone timeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#ffffff] border border-black/[0.08] rounded-full p-1 shadow-sm text-[13px]">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full font-medium transition ${
                viewMode === "kanban" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              <Trello className="h-3.5 w-3.5" /> Kanban Board
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full font-medium transition ${
                viewMode === "timeline" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              <GanttChart className="h-3.5 w-3.5" /> Timeline
            </button>
          </div>

          {/* Platform Filter */}
          <div className="flex items-center gap-2 bg-[#ffffff] border border-black/[0.08] rounded-full px-3.5 py-1 text-[13px] shadow-sm">
            <span className="text-[#86868b] font-medium text-[12px]">Platform:</span>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-transparent text-[#1d1d1f] font-medium focus:outline-none text-[13px]"
            >
              <option value="all">All Platforms</option>
              <option value="Instagram">Instagram</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Facebook">Facebook</option>
              <option value="YouTube">YouTube</option>
              <option value="X">X (Twitter)</option>
              <option value="Email">Email</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transition Validation Error Alert */}
      {transitionError && (
        <div className="rounded-2xl border border-[#ffd5d0] bg-[#fff0ee] p-4 text-[13px] text-[#b42318] flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{transitionError}</span>
          </div>
          <button
            onClick={() => setTransitionError(null)}
            className="text-[#b42318] hover:opacity-75 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* View Mode: Kanban Board */}
      {viewMode === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-6 items-start min-h-[calc(100vh-16rem)]">
          {columns.map((col) => {
            const colItems = projectItems.filter((i) => i.stage === col.stage);

            return (
              <div
                key={col.stage}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.stage)}
                className={`w-72 shrink-0 rounded-2xl border bg-[#fbfbfd] p-3 flex flex-col max-h-[calc(100vh-16rem)] transition ${
                  draggedItemId ? "border-dashed border-[#0071e3]/50 bg-[#eaf3fc]/30" : "border-black/[0.08]"
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-2.5 mb-3 px-1">
                  <h3 className="font-semibold text-[#1d1d1f] text-[13px]">{col.title}</h3>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f2f2f7] text-[11px] font-bold text-[#6e6e73]">
                    {colItems.length}
                  </span>
                </div>

                {/* Items List */}
                <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                  {colItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-black/[0.08] p-6 text-center text-[12px] text-[#86868b]">
                      Drop cards here
                    </div>
                  ) : (
                    colItems.map((item) => {
                      const latestVersion = state.submissionVersions.find(
                        (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
                      );
                      const approvalSummary = getItemApprovalMatrixSummary(
                        item,
                        latestVersion,
                        state.approvalDecisions,
                        state.founderOverrides
                      );

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item.id)}
                          className="cursor-grab active:cursor-grabbing rounded-xl border border-black/[0.08] bg-[#ffffff] p-3.5 hover:shadow-md hover:border-[#0071e3]/40 transition space-y-2.5 group shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[10px] font-medium text-[#1d1d1f]">
                              {item.platform}
                            </span>
                            {item.contentType === "trial_reel" ? (
                              <span className="rounded-full bg-[#f2f2f7] text-[#0066cc] text-[10px] font-bold px-2 py-0.5">
                                Trial Reel
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#86868b] capitalize">
                                {item.contentType}
                              </span>
                            )}
                          </div>

                          <Link
                            href={`/projects/${projectId}/content/${item.id}`}
                            className="block text-[13px] font-semibold text-[#1d1d1f] group-hover:text-[#0066cc] transition line-clamp-2 leading-snug"
                          >
                            {item.title}
                          </Link>

                          {/* Approval Status Chip */}
                          <div className="flex items-center justify-between text-[11px]">
                            {approvalSummary.isOverridden ? (
                              <span className="status-approved rounded-full px-2 py-0.5 font-bold text-[10px]">
                                Founder Override
                              </span>
                            ) : approvalSummary.anyChangesRequested ? (
                              <span className="status-changes rounded-full px-2 py-0.5 font-bold text-[10px]">
                                Changes Req
                              </span>
                            ) : approvalSummary.allComponentsApproved ? (
                              <span className="status-approved rounded-full px-2 py-0.5 font-bold text-[10px]">
                                3/3 Approved
                              </span>
                            ) : (
                              <span className="status-review rounded-full px-2 py-0.5 font-medium text-[10px]">
                                {approvalSummary.approvedCount}/3 Approved
                              </span>
                            )}
                          </div>

                          {/* Quick Stage Mover Dropdown */}
                          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-black/[0.06]">
                            <span className="text-[#86868b]">Move:</span>
                            <select
                              value={item.stage}
                              onChange={(e) => handleStageTransition(item.id, e.target.value as ContentStage)}
                              className="bg-[#f5f5f7] border border-black/[0.08] text-[#1d1d1f] rounded-lg px-2 py-0.5 text-[11px] focus:outline-none"
                            >
                              <option value="draft">Draft</option>
                              <option value="submitted">Submitted</option>
                              <option value="in_review">In Review</option>
                              <option value="changes_requested">Changes Req</option>
                              <option value="approved">Approved</option>
                              <option value="scheduled">Scheduled</option>
                              <option value="published">Published</option>
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Timeline View */
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
            <h3 className="font-semibold text-[#1d1d1f] text-[16px]">Quarterly Delivery Timeline</h3>
            <span className="text-[13px] text-[#86868b]">August – September 2026</span>
          </div>

          <div className="space-y-3">
            {projectItems.map((item) => {
              const deadline = item.deadlines.scheduledPublicationDate || item.deadlines.submissionDeadline;
              return (
                <div key={item.id} className="rounded-xl border border-black/[0.06] bg-[#fbfbfd] p-4 text-[13px] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
                        {item.platform}
                      </span>
                      <Link
                        href={`/projects/${projectId}/content/${item.id}`}
                        className="font-semibold text-[#1d1d1f] hover:text-[#0066cc] transition"
                      >
                        {item.title}
                      </Link>
                    </div>
                    <span className="status-review rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize">
                      {item.stage.replace("_", " ")}
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] text-[#86868b]">
                      <span>Draft Stage</span>
                      <span>Target: {deadline ? formatDate(deadline) : "Unset"}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#f2f2f7] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.stage === "published"
                            ? "bg-[#248a3d] w-full"
                            : item.stage === "approved"
                            ? "bg-[#0071e3] w-4/5"
                            : item.stage === "in_review"
                            ? "bg-[#9a6700] w-3/5"
                            : "bg-[#86868b] w-1/3"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
