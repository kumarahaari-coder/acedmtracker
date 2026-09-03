"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getAuthoritativeOrganizationApprovalsAction, OrganizationApprovalItem } from "@/lib/actions/approvals";
import { CheckCircle2, AlertCircle, Filter, ShieldCheck, Clock, FileCheck2, Loader2, ArrowRight, Send } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { useAppState } from "@/lib/context/AppStateContext";

export default function OrganizationApprovalsPage() {
  const { activeRole } = useRole();
  const { updateContentItemStage } = useAppState();
  const [items, setItems] = useState<OrganizationApprovalItem[]>([]);
  const [projectsList, setProjectsList] = useState<Array<{ id: string; name: string }>>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("all");
  const [selectedConsultantStatus, setSelectedConsultantStatus] = useState<string>("all");
  const [selectedFounderStatus, setSelectedFounderStatus] = useState<string>("all");
  const [selectedOverallStatus, setSelectedOverallStatus] = useState<string>("all");

  useEffect(() => {
    async function loadApprovals() {
      setIsLoading(true);
      setErrorNotice(null);
      const res = await getAuthoritativeOrganizationApprovalsAction();
      if (res.success) {
        setItems(res.items);
        setProjectsList(res.projects);
        setTeamMembers(res.teamMembers);
      } else {
        setErrorNotice(res.error || "Failed to load Organization Approvals Queue");
      }
      setIsLoading(false);
    }
    loadApprovals();
  }, []);

  const filteredItems = items.filter((item) => {
    if (selectedProjectId !== "all" && item.projectId !== selectedProjectId) return false;
    if (selectedAssigneeId !== "all" && item.assignedOwnerId !== selectedAssigneeId) return false;
    if (selectedConsultantStatus !== "all" && item.consultantStatus !== selectedConsultantStatus) return false;
    if (selectedFounderStatus !== "all" && item.founderStatus !== selectedFounderStatus) return false;
    if (selectedOverallStatus !== "all" && item.overallStatus !== selectedOverallStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#0071e3]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0071e3]">
              Company Scope
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Organization Approvals Queue</h1>
          </div>
          <p className="text-xs text-[#86868b] mt-1">
            Authoritative approval queue tracking Copy, Creative, and Posting Date decisions across all projects.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5 text-[#0071e3]" />
          <span>Filter Approvals</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          {/* Project */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Projects ({projectsList.length})</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assigned Owner */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Assigned Owner</label>
            <select
              value={selectedAssigneeId}
              onChange={(e) => setSelectedAssigneeId(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Team Members</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Consultant Status */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Consultant Status</label>
            <select
              value={selectedConsultantStatus}
              onChange={(e) => setSelectedConsultantStatus(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Consultant States</option>
              <option value="approved">Approved</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Founder Status */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Founder Status</label>
            <select
              value={selectedFounderStatus}
              onChange={(e) => setSelectedFounderStatus(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Founder States</option>
              <option value="approved">Approved</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Overall Status */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Overall Status</label>
            <select
              value={selectedOverallStatus}
              onChange={(e) => setSelectedOverallStatus(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Overall States</option>
              <option value="approved">Approved</option>
              <option value="in_review">In Review</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-black/[0.08]">
          <Loader2 className="h-6 w-6 animate-spin text-[#0071e3]" />
          <span className="ml-2 text-xs font-medium text-[#86868b]">Loading Organization Approvals Queue...</span>
        </div>
      ) : errorNotice ? (
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-black/[0.08] space-y-2">
          <FileCheck2 className="h-8 w-8 mx-auto text-[#86868b]" />
          <p className="text-sm font-semibold text-[#1d1d1f]">No Pending Approvals</p>
          <p className="text-xs text-[#86868b]">No deliverables match your current approval filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f5f5f7] border-b border-black/[0.08] font-semibold text-[#1d1d1f] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Project</th>
                  <th className="p-3.5">Deliverable</th>
                  <th className="p-3.5 text-center">3-Component Matrix</th>
                  <th className="p-3.5">Consultant</th>
                  <th className="p-3.5">Founder</th>
                  <th className="p-3.5">Assigned Owner</th>
                  <th className="p-3.5">Due Date</th>
                  <th className="p-3.5">Overall</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06] text-[#1d1d1f]">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#fbfbfd] transition">
                    <td className="p-3.5 font-semibold text-[#0071e3]">
                      <Link href={`/projects/${item.projectId}`} className="hover:underline">
                        {item.projectName}
                      </Link>
                    </td>
                    <td className="p-3.5 font-medium">
                      <div className="flex flex-col">
                        <Link href={`/projects/${item.projectId}/content/${item.id}`} className="hover:underline font-semibold text-[#1d1d1f]">
                          {item.title}
                        </Link>
                        <span className="text-[11px] text-[#86868b]">
                          {item.platform} • v{item.currentVersionNumber}
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5 text-[11px]">
                        <span className={`px-2 py-0.5 rounded font-medium ${item.copyApprovalStatus === "approved" ? "bg-green-100 text-green-800" : item.copyApprovalStatus === "changes_requested" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>
                          Copy: {item.copyApprovalStatus}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-medium ${item.creativeApprovalStatus === "approved" ? "bg-green-100 text-green-800" : item.creativeApprovalStatus === "changes_requested" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>
                          Creative: {item.creativeApprovalStatus}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-medium ${item.postingDateApprovalStatus === "approved" ? "bg-green-100 text-green-800" : item.postingDateApprovalStatus === "changes_requested" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>
                          Date: {item.postingDateApprovalStatus}
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 capitalize font-medium">
                      <span className={item.consultantStatus === "approved" ? "text-green-700" : item.consultantStatus === "changes_requested" ? "text-amber-700" : "text-gray-500"}>
                        {item.consultantStatus}
                      </span>
                    </td>
                    <td className="p-3.5 capitalize font-medium">
                      <span className={item.founderStatus === "approved" ? "text-green-700" : item.founderStatus === "changes_requested" ? "text-amber-700" : "text-gray-500"}>
                        {item.founderStatus}
                      </span>
                    </td>
                    <td className="p-3.5 font-medium">
                      {item.assignedOwnerName ? (
                        <span className="text-[#1d1d1f]">{item.assignedOwnerName}</span>
                      ) : (
                        <span className="text-[#86868b] italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3.5 text-[#6e6e73]">
                      {item.submissionDeadline ? new Date(item.submissionDeadline).toLocaleDateString() : "No Due Date"}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          item.overallStatus === "approved"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : item.overallStatus === "changes_requested"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : item.overallStatus === "in_review"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {item.overallStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {activeRole === "designer" ? (
                        item.overallStatus === "draft" || item.overallStatus === "changes_requested" ? (
                          <button
                            onClick={async () => {
                              await updateContentItemStage(item.id, "submitted");
                              const res = await getAuthoritativeOrganizationApprovalsAction();
                              if (res.success) setItems(res.items);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-3.5 py-1 text-[11px] font-semibold text-white transition shadow-sm"
                          >
                            <Send className="h-3 w-3" /> Submit for Review
                          </button>
                        ) : (
                          <Link
                            href={`/projects/${item.projectId}/content/${item.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3 py-1 text-[11px] font-medium text-[#0071e3] transition"
                          >
                            View Deliverable <ArrowRight className="h-3 w-3" />
                          </Link>
                        )
                      ) : (
                        <Link
                          href={`/projects/${item.projectId}/content/${item.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3 py-1 text-[11px] font-medium text-[#0071e3] transition"
                        >
                          Review <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
