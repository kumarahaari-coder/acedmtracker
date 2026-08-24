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
  Sparkles,
} from "lucide-react";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { formatDate } from "@/lib/formatters";

export default function ApprovalsQueuePage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state } = useAppState();
  const { activeRole } = useRole();

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "changes_requested" | "approved">("pending");

  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);

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

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Approvals Queue
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Review 3-component status (Copy, Creative, Posting Date) across project deliverables.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 bg-[#ffffff] border border-black/[0.08] rounded-full p-1 shadow-sm text-[13px]">
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

      {/* Approvals Table */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="divide-y divide-black/[0.06]">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-[13px] text-[#86868b]">
              No items matching filter '{statusFilter}'.
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

              return (
                <div
                  key={item.id}
                  className="p-5 sm:px-6 flex items-center justify-between gap-4 hover:bg-[#f5f5f7]/60 transition"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
                        {item.platform} • {item.contentType}
                      </span>
                      <Link
                        href={`/projects/${projectId}/content/${item.id}`}
                        className="font-semibold text-[15px] text-[#1d1d1f] hover:text-[#0066cc] truncate"
                      >
                        {item.title}
                      </Link>
                    </div>
                    <div className="text-[12px] text-[#86868b]">
                      Version {item.currentVersionNumber} • Scheduled for {formatDate(item.deadlines.scheduledPublicationDate)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {/* 3-Component Matrix Chip */}
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className={`px-2 py-0.5 rounded-full ${summary.copy.isFullyApproved ? "status-approved" : "status-review"}`}>
                        Copy
                      </span>
                      <span className={`px-2 py-0.5 rounded-full ${summary.creative.isFullyApproved ? "status-approved" : "status-review"}`}>
                        Creative
                      </span>
                      <span className={`px-2 py-0.5 rounded-full ${summary.posting_date.isFullyApproved ? "status-approved" : "status-review"}`}>
                        Date
                      </span>
                    </div>

                    <Link
                      href={`/projects/${projectId}/content/${item.id}`}
                      className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
                    >
                      Review →
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
