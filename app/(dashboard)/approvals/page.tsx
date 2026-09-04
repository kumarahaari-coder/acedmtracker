"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getAuthoritativeGlobalApprovalQueueAction,
  GlobalApprovalQueueItemDTO,
  GlobalApprovalQueueDTO,
} from "@/lib/actions/approvals";
import {
  CheckCircle2,
  AlertCircle,
  Filter,
  FileCheck2,
  Loader2,
  ArrowRight,
  RefreshCw,
  Clock,
  ExternalLink,
  User as UserIcon,
} from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { formatDate } from "@/lib/formatters";

export default function GlobalApprovalsPage() {
  const { activeRole, activeUserId } = useRole();
  const [data, setData] = useState<GlobalApprovalQueueDTO | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "changes_requested" | "approved" | "all">("pending");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    setIsLoading(true);
    setErrorNotice(null);
    try {
      const res = await getAuthoritativeGlobalApprovalQueueAction(activeTab, activeUserId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setErrorNotice(res.error || "Failed to load Global Approvals Queue");
      }
    } catch (err: any) {
      setErrorNotice(err.message || "Network error loading approvals");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, activeUserId]);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const items = data?.items || [];
  const counts = data?.counts || { all: 0, pending: 0, changes_requested: 0, approved: 0 };
  const projectsList = data?.projects || [];

  const filteredItems = items.filter((item) => {
    if (selectedProjectId !== "all" && item.projectId !== selectedProjectId) return false;
    return true;
  });

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#0071e3]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0071e3]">
              Organization Scope
            </span>
            <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
              Global Approvals Queue
            </h1>
          </div>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Authoritative approval queue tracking reviewable deliverables across all authorized projects.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadApprovals()}
            disabled={isLoading}
            title="Refresh Approvals"
            className="p-2.5 rounded-full border border-black/[0.08] bg-white text-[#6e6e73] hover:text-[#1d1d1f] transition shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs & Secondary Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center bg-[#f5f5f7] p-1 rounded-full text-[13px] border border-black/[0.06] overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-medium transition whitespace-nowrap ${
              activeTab === "pending"
                ? "bg-white text-[#1d1d1f] shadow-xs"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            <span>Needs Decision</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                activeTab === "pending"
                  ? "bg-[#0071e3] text-white"
                  : "bg-black/[0.06] text-[#6e6e73]"
              }`}
            >
              {counts.pending}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("changes_requested")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-medium transition whitespace-nowrap ${
              activeTab === "changes_requested"
                ? "bg-white text-[#1d1d1f] shadow-xs"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            <span>Changes Requested</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                activeTab === "changes_requested"
                  ? "bg-[#b42318] text-white"
                  : "bg-black/[0.06] text-[#6e6e73]"
              }`}
            >
              {counts.changes_requested}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("approved")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-medium transition whitespace-nowrap ${
              activeTab === "approved"
                ? "bg-white text-[#1d1d1f] shadow-xs"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            <span>Approved</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                activeTab === "approved"
                  ? "bg-[#027a48] text-white"
                  : "bg-black/[0.06] text-[#6e6e73]"
              }`}
            >
              {counts.approved}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-medium transition whitespace-nowrap ${
              activeTab === "all"
                ? "bg-white text-[#1d1d1f] shadow-xs"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            <span>All Reviewable</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                activeTab === "all"
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-black/[0.06] text-[#6e6e73]"
              }`}
            >
              {counts.all}
            </span>
          </button>
        </div>

        {/* Project Selector Filter */}
        {projectsList.length > 1 && (
          <div className="flex items-center gap-2 bg-white border border-black/[0.08] rounded-full px-3.5 py-1.5 text-[13px] shadow-2xs">
            <Filter className="h-3.5 w-3.5 text-[#86868b]" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-[#1d1d1f] font-medium focus:outline-none text-[13px]"
            >
              <option value="all">All Projects ({projectsList.length})</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {errorNotice && (
        <div className="rounded-2xl border border-[#ffd5d0] bg-[#fff0ee] p-4 text-[13px] text-[#b42318] flex items-center gap-3 shadow-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Main List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-black/[0.08] min-h-[300px] gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#0071e3]" />
          <span className="text-[13px] font-medium text-[#86868b]">Loading approvals queue...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-black/[0.08] space-y-3 shadow-xs">
          <FileCheck2 className="h-10 w-10 mx-auto text-[#86868b]/70" />
          <p className="text-[16px] font-semibold text-[#1d1d1f]">No Deliverables in Queue</p>
          <p className="text-[13px] text-[#86868b] max-w-md mx-auto">
            {activeTab === "pending"
              ? "All submitted deliverables have decisions recorded. New items will appear here when designers submit work."
              : activeTab === "changes_requested"
              ? "No deliverables currently have open change requests."
              : activeTab === "approved"
              ? "No approved deliverables found matching this filter."
              : "No reviewable deliverables found across authorized projects."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/[0.08] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#f5f5f7] border-b border-black/[0.08] font-semibold text-[#1d1d1f] uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-4">Project</th>
                  <th className="p-4">Deliverable</th>
                  <th className="p-4 text-center">3-Component Status</th>
                  <th className="p-4">Assigned Designer</th>
                  <th className="p-4">Submission / Target</th>
                  <th className="p-4 text-center">Overall Stage</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06] text-[#1d1d1f]">
                {filteredItems.map((item) => {
                  const copy = item.summary.copy;
                  const creative = item.summary.creative;
                  const date = item.summary.posting_date;

                  return (
                    <tr key={item.id} className="hover:bg-[#fbfbfd] transition">
                      {/* Project Column */}
                      <td className="p-4 font-semibold text-[#0071e3] whitespace-nowrap">
                        <Link href={`/projects/${item.projectId}`} className="hover:underline">
                          {item.projectName}
                        </Link>
                        <div className="text-[11px] text-[#86868b] font-normal">{item.clientBrand}</div>
                      </td>

                      {/* Deliverable Title & Platform */}
                      <td className="p-4">
                        <Link
                          href={`/projects/${item.projectId}/content/${item.id}`}
                          className="font-medium text-[#1d1d1f] hover:text-[#0071e3] transition line-clamp-1"
                        >
                          {item.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#86868b]">
                          <span className="capitalize">{item.platform}</span>
                          <span>•</span>
                          <span className="capitalize">{item.contentType}</span>
                          <span>•</span>
                          <span>v{item.currentVersionNumber}</span>
                        </div>
                      </td>

                      {/* 3-Component Matrix */}
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Copy */}
                          <span
                            title={`Copy: ${copy.isFullyApproved ? "Approved" : copy.hasChangesRequested ? "Changes Req" : "Pending"}`}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              copy.isFullyApproved
                                ? "bg-[#ecfdf3] text-[#027a48] border border-[#a6f4c5]"
                                : copy.hasChangesRequested
                                ? "bg-[#fef3f2] text-[#b42318] border border-[#fecdca]"
                                : "bg-[#f5f5f7] text-[#6e6e73] border border-black/[0.06]"
                            }`}
                          >
                            Copy
                          </span>

                          {/* Creative */}
                          <span
                            title={`Creative: ${creative.isFullyApproved ? "Approved" : creative.hasChangesRequested ? "Changes Req" : "Pending"}`}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              creative.isFullyApproved
                                ? "bg-[#ecfdf3] text-[#027a48] border border-[#a6f4c5]"
                                : creative.hasChangesRequested
                                ? "bg-[#fef3f2] text-[#b42318] border border-[#fecdca]"
                                : "bg-[#f5f5f7] text-[#6e6e73] border border-black/[0.06]"
                            }`}
                          >
                            Creative
                          </span>

                          {/* Date */}
                          <span
                            title={`Posting Date: ${date.isFullyApproved ? "Approved" : date.hasChangesRequested ? "Changes Req" : "Pending"}`}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              date.isFullyApproved
                                ? "bg-[#ecfdf3] text-[#027a48] border border-[#a6f4c5]"
                                : date.hasChangesRequested
                                ? "bg-[#fef3f2] text-[#b42318] border border-[#fecdca]"
                                : "bg-[#f5f5f7] text-[#6e6e73] border border-black/[0.06]"
                            }`}
                          >
                            Date
                          </span>
                        </div>
                      </td>

                      {/* Assigned Designer */}
                      <td className="p-4 whitespace-nowrap text-[#6e6e73]">
                        {item.assignedOwner ? (
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="h-3.5 w-3.5 text-[#86868b]" />
                            <span className="font-medium text-[#1d1d1f]">{item.assignedOwner.name}</span>
                          </div>
                        ) : (
                          <span className="text-[#86868b] italic">Unassigned</span>
                        )}
                      </td>

                      {/* Deadline / Publication */}
                      <td className="p-4 whitespace-nowrap text-[#6e6e73] text-[12px]">
                        {item.submissionDeadline ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-[#86868b]" />
                            <span>{formatDate(item.submissionDeadline)}</span>
                          </div>
                        ) : (
                          <span className="text-[#86868b]">No deadline</span>
                        )}
                      </td>

                      {/* Overall Stage Badge */}
                      <td className="p-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            item.stage === "approved" || item.stage === "scheduled" || item.stage === "published"
                              ? "bg-[#ecfdf3] text-[#027a48]"
                              : item.stage === "changes_requested"
                              ? "bg-[#fef3f2] text-[#b42318]"
                              : "bg-[#eff8ff] text-[#175cd3]"
                          }`}
                        >
                          {item.stage === "in_review"
                            ? "In Review"
                            : item.stage === "submitted"
                            ? "Submitted"
                            : item.stage === "changes_requested"
                            ? "Changes Req"
                            : item.stage === "approved"
                            ? "Approved"
                            : item.stage}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="p-4 text-right whitespace-nowrap">
                        <Link
                          href={`/projects/${item.projectId}/content/${item.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1.5 text-[12px] font-medium text-[#0071e3] transition shadow-2xs"
                        >
                          <span>Review</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
