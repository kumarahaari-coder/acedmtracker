"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Filter,
  FolderKanban,
  LineChart,
  Lock,
  Sparkles,
  Timer,
  Users,
} from "lucide-react";
import { getOrganizationPerformance, PerformanceFilters } from "@/lib/performance";
import { formatDurationHuman } from "@/lib/formatters";

export default function ProjectPerformancePage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("all");
  const [selectedDesignerId, setSelectedDesignerId] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedContentType, setSelectedContentType] = useState<string>("all");

  const project = state.projects.find((p) => p.id === projectId);

  const filters: PerformanceFilters = {
    dateRange,
    projectId,
    designerId: selectedDesignerId,
    platform: selectedPlatform,
    contentType: selectedContentType,
  };

  const perfResult = getOrganizationPerformance(state, activeUserId, activeRole, filters);

  if (perfResult.status === 403 || !perfResult.data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-center animate-in fade-in">
        <div className="max-w-md w-full rounded-3xl border border-black/[0.08] bg-white p-8 space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto border border-[#ffd5d0]">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1d1d1f]">Access Restricted</h2>
          <p className="text-[14px] text-[#6e6e73] leading-relaxed">
            {perfResult.error || "Performance analytics are restricted to authorized project management roles."}
          </p>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white shadow-sm"
          >
            Return to Project
          </Link>
        </div>
      </div>
    );
  }

  const { overview, scorecards, workload } = perfResult.data;

  // Find designers assigned to this project
  const projectMembers = state.projectMemberships.filter((m) => m.projectId === projectId && m.status === "active");
  const projectMemberUserIds = new Set(projectMembers.map((m) => m.userId));
  const projectDesigners = state.users.filter(
    (u) => projectMemberUserIds.has(u.id) && (u.role === "designer" || u.jobTitle?.toLowerCase().includes("designer") || u.jobTitle?.toLowerCase().includes("editor"))
  );

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#f5f5f7] border border-black/[0.06] text-[11px] font-semibold text-[#1d1d1f] mb-1.5">
            <Sparkles className="h-3 w-3 text-[#0071e3]" /> Project Efficiency &amp; Workload
          </div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            {project?.name || "Project"} Performance
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Delivery reliability, review cycles, and production time for this specific client workspace.
          </p>
        </div>

        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-4 py-2 text-[13px] font-medium text-[#1d1d1f] border border-black/[0.08] transition self-start md:self-auto"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Project Overview
        </Link>
      </div>

      {/* Unified Filter Bar */}
      <div className="bg-white border border-black/[0.08] p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <div className="flex items-center gap-2 text-[#86868b] font-medium">
          <Filter className="h-4 w-4 text-[#0071e3]" /> Filters:
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end">
          {/* Date Range */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[#1d1d1f] font-medium focus:outline-none"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>

          {/* Project Designer Filter */}
          <select
            value={selectedDesignerId}
            onChange={(e) => setSelectedDesignerId(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[#1d1d1f] font-medium focus:outline-none max-w-[180px]"
          >
            <option value="all">All Project Designers ({projectDesigners.length})</option>
            {projectDesigners.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.status === "inactive" ? "(Inactive)" : ""}
              </option>
            ))}
          </select>

          {/* Platform Filter */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[#1d1d1f] font-medium focus:outline-none"
          >
            <option value="all">All Platforms</option>
            <option value="Instagram">Instagram</option>
            <option value="Facebook">Facebook</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="YouTube">YouTube</option>
            <option value="X">X</option>
            <option value="Email">Email</option>
          </select>

          {/* Content Type Filter */}
          <select
            value={selectedContentType}
            onChange={(e) => setSelectedContentType(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[#1d1d1f] font-medium focus:outline-none"
          >
            <option value="all">All Content Types</option>
            <option value="post">Post</option>
            <option value="carousel">Carousel</option>
            <option value="reel">Reel</option>
            <option value="trial_reel">Trial Reel</option>
          </select>
        </div>
      </div>

      {/* Top-Level Project KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Completed Deliverables
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f]">
            {overview.completedDeliverablesCount}
          </div>
          <span className="text-[11px] text-[#86868b]">
            Across {overview.completedConceptsCount} concept(s)
          </span>
        </div>

        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            On-Time Delivery
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f]">
            {overview.onTimeDeliveryRate !== null ? `${overview.onTimeDeliveryRate}%` : "—"}
          </div>
          <span className="text-[11px] text-[#86868b]">
            {overview.onTimeEligibleCount > 0
              ? `${overview.onTimeDeliveredCount}/${overview.onTimeEligibleCount} initial submissions`
              : "Insufficient data"}
          </span>
        </div>

        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            First-Pass Approval
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f]">
            {overview.firstPassApprovalRate !== null ? `${overview.firstPassApprovalRate}%` : "—"}
          </div>
          <span className="text-[11px] text-[#86868b]">
            {overview.firstPassEligibleCount > 0
              ? `${overview.firstPassApprovedCount}/${overview.firstPassEligibleCount} reviews`
              : "Insufficient data"}
          </span>
        </div>

        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Avg Production Time
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f]">
            {overview.avgProductionTimeSeconds !== null
              ? formatDurationHuman(overview.avgProductionTimeSeconds)
              : "—"}
          </div>
          <span className="text-[11px] text-[#86868b]">
            {formatDurationHuman(overview.totalTrackedSeconds)} total tracked
          </span>
        </div>

        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Active Project Tasks
          </span>
          <div className="text-[24px] font-bold text-[#0071e3]">
            {overview.activeAssignmentsCount}
          </div>
          <span className="text-[11px] text-[#b42318] font-semibold">
            {overview.overdueAssignmentsCount} overdue
          </span>
        </div>
      </div>

      {/* Project Team Performance Table */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
            <Users className="h-5 w-5 text-[#0071e3]" /> Assigned Team Performance
          </h2>
          <span className="text-[12px] text-[#86868b]">{scorecards.length} contributor(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-[#1d1d1f]">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] font-semibold text-[12px] border-b border-black/[0.08]">
              <tr>
                <th className="p-3 pl-4">Designer</th>
                <th className="p-3">Completed Deliverables</th>
                <th className="p-3">On-Time %</th>
                <th className="p-3">First-Pass %</th>
                <th className="p-3">Avg Prod Time</th>
                <th className="p-3">Tracked Effort</th>
                <th className="p-3">Active Tasks</th>
                <th className="p-3 pr-4 text-right">Drilldown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {scorecards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#86868b]">
                    No team performance records match the current filter selection for this project.
                  </td>
                </tr>
              ) : (
                scorecards.map((sc) => (
                  <tr key={sc.userId} className="hover:bg-[#fbfbfd]">
                    <td className="p-3 pl-4 font-semibold text-[#1d1d1f]">
                      <div className="flex items-center gap-2">
                        <span>{sc.name}</span>
                        <span className="text-[11px] text-[#86868b] font-normal">({sc.jobTitle || sc.role})</span>
                      </div>
                    </td>
                    <td className="p-3 font-medium">{sc.completedDeliverablesCount}</td>
                    <td className="p-3 font-mono">{sc.onTimeDeliveryRate !== null ? `${sc.onTimeDeliveryRate}%` : "—"}</td>
                    <td className="p-3 font-mono">{sc.firstPassApprovalRate !== null ? `${sc.firstPassApprovalRate}%` : "—"}</td>
                    <td className="p-3 font-mono">
                      {sc.avgProductionTimeSeconds !== null ? formatDurationHuman(sc.avgProductionTimeSeconds) : "—"}
                    </td>
                    <td className="p-3 font-mono text-[#86868b]">{formatDurationHuman(sc.totalTrackedSeconds)}</td>
                    <td className="p-3 font-medium">{sc.activeAssignmentsCount}</td>
                    <td className="p-3 pr-4 text-right">
                      <Link
                        href={`/performance/${sc.userId}`}
                        className="text-[#0066cc] hover:underline font-semibold text-[12px] inline-flex items-center gap-1"
                      >
                        Drilldown <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
