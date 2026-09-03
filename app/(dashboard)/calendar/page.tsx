"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getAuthoritativeOrganizationCalendarAction, OrganizationCalendarItem } from "@/lib/actions/calendar";
import { Calendar as CalendarIcon, Filter, Layers, User, CheckCircle2, Clock, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export default function OrganizationCalendarPage() {
  const [items, setItems] = useState<OrganizationCalendarItem[]>([]);
  const [projectsList, setProjectsList] = useState<Array<{ id: string; name: string }>>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("all");
  const [selectedWorkType, setSelectedWorkType] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedApprovalStatus, setSelectedApprovalStatus] = useState<string>("all");

  useEffect(() => {
    async function loadCalendar() {
      setIsLoading(true);
      setErrorNotice(null);
      const res = await getAuthoritativeOrganizationCalendarAction();
      if (res.success) {
        setItems(res.items);
        setProjectsList(res.projects);
        setTeamMembers(res.teamMembers);
      } else {
        setErrorNotice(res.error || "Failed to load Organization Calendar");
      }
      setIsLoading(false);
    }
    loadCalendar();
  }, []);

  const workTypes = Array.from(new Set(items.map((i) => i.workType).filter(Boolean)));
  const platforms = Array.from(new Set(items.map((i) => i.platform).filter(Boolean)));
  const stages = Array.from(new Set(items.map((i) => i.stage).filter(Boolean)));

  const filteredItems = items.filter((item) => {
    if (selectedProjectId !== "all" && item.projectId !== selectedProjectId) return false;
    if (selectedAssigneeId !== "all" && item.assignedOwnerId !== selectedAssigneeId) return false;
    if (selectedWorkType !== "all" && item.workType !== selectedWorkType) return false;
    if (selectedPlatform !== "all" && item.platform !== selectedPlatform) return false;
    if (selectedStage !== "all" && item.stage !== selectedStage) return false;
    if (selectedApprovalStatus !== "all" && item.approvalStatus !== selectedApprovalStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#0071e3]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0071e3]">
              Company Scope
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Organization Calendar</h1>
          </div>
          <p className="text-xs text-[#86868b] mt-1">
            Authoritative delivery schedule aggregated across all active projects in the organization.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5 text-[#0071e3]" />
          <span>Filter Deliverables</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
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

          {/* Work Type */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Work Type</label>
            <select
              value={selectedWorkType}
              onChange={(e) => setSelectedWorkType(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Work Types</option>
              {workTypes.map((wt) => (
                <option key={wt} value={wt}>
                  {wt}
                </option>
              ))}
            </select>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Platform</label>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Platforms</option>
              {platforms.map((plat) => (
                <option key={plat} value={plat}>
                  {plat}
                </option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Workflow Stage</label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Stages</option>
              {stages.map((stg) => (
                <option key={stg} value={stg}>
                  {stg.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Approval Status */}
          <div>
            <label className="block text-[#86868b] font-medium mb-1">Approval Status</label>
            <select
              value={selectedApprovalStatus}
              onChange={(e) => setSelectedApprovalStatus(e.target.value)}
              className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-2 text-[#1d1d1f]"
            >
              <option value="all">All Statuses</option>
              <option value="Approved">Approved</option>
              <option value="Under Review">Under Review</option>
              <option value="Changes Requested">Changes Requested</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Deliverables Grid / List */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-black/[0.08]">
          <Loader2 className="h-6 w-6 animate-spin text-[#0071e3]" />
          <span className="ml-2 text-xs font-medium text-[#86868b]">Loading Authoritative Organization Calendar...</span>
        </div>
      ) : errorNotice ? (
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-black/[0.08] space-y-2">
          <CalendarIcon className="h-8 w-8 mx-auto text-[#86868b]" />
          <p className="text-sm font-semibold text-[#1d1d1f]">No Deliverables Found</p>
          <p className="text-xs text-[#86868b]">No deliverables match your current organization filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f5f5f7] border-b border-black/[0.08] font-semibold text-[#1d1d1f] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Project</th>
                  <th className="p-3.5">Deliverable</th>
                  <th className="p-3.5">Work Type</th>
                  <th className="p-3.5">Platform</th>
                  <th className="p-3.5">Assigned Owner</th>
                  <th className="p-3.5">Due / Pub Date</th>
                  <th className="p-3.5">Stage</th>
                  <th className="p-3.5">Approval Status</th>
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
                      <Link href={`/projects/${item.projectId}/content/${item.id}`} className="hover:underline">
                        {item.title}
                      </Link>
                    </td>
                    <td className="p-3.5 text-[#6e6e73]">{item.workType}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center rounded-full bg-[#f5f5f7] px-2 py-0.5 font-medium text-[#1d1d1f]">
                        {item.platform}
                      </span>
                    </td>
                    <td className="p-3.5 font-medium">
                      {item.assignedOwnerName ? (
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full bg-[#0071e3] text-white font-bold text-[10px] flex items-center justify-center">
                            {item.assignedOwnerName[0].toUpperCase()}
                          </div>
                          <span>{item.assignedOwnerName}</span>
                        </div>
                      ) : (
                        <span className="text-[#86868b] italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3.5 text-[#6e6e73]">
                      {item.scheduledPublicationDate
                        ? new Date(item.scheduledPublicationDate).toLocaleDateString()
                        : item.submissionDeadline
                        ? new Date(item.submissionDeadline).toLocaleDateString()
                        : "Unscheduled"}
                    </td>
                    <td className="p-3.5 capitalize font-medium">{item.stage.replace(/_/g, " ")}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          item.approvalStatus === "Approved"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : item.approvalStatus === "Changes Requested"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : item.approvalStatus === "Under Review"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {item.approvalStatus}
                      </span>
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
