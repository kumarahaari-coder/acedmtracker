"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  FolderKanban,
  Layers,
  LineChart,
  Lock,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { getOrganizationPerformance, PerformanceFilters } from "@/lib/performance";
import { formatDurationHuman } from "@/lib/formatters";

export default function PerformanceDashboardPage() {
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  // Filters State
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedDesignerId, setSelectedDesignerId] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedContentType, setSelectedContentType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"scorecards" | "workload">("scorecards");

  const filters: PerformanceFilters = {
    dateRange,
    projectId: selectedProjectId,
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
            {perfResult.error || "The Performance and Workload Dashboard is restricted to authorized management (Founder, Consultant, Admin)."}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white shadow-sm"
          >
            Return to Workspace
          </Link>
        </div>
      </div>
    );
  }

  const { overview, scorecards, workload } = perfResult.data;

  // Permitted projects for filter dropdown
  const permittedProjects = state.projects.filter((p) => {
    if (activeRole === "founder" || activeRole === "admin") return true;
    return state.projectMemberships.some(
      (m) => m.projectId === p.id && m.userId === activeUserId && m.status === "active"
    );
  });

  const designersList = state.users.filter(
    (u) => u.role === "designer" || u.jobTitle?.toLowerCase().includes("designer") || u.jobTitle?.toLowerCase().includes("editor")
  );

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#f5f5f7] border border-black/[0.06] text-[11px] font-semibold text-[#1d1d1f] mb-1.5">
            <Sparkles className="h-3 w-3 text-[#0071e3]" /> Operational Efficiency &amp; Workload
          </div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Team Performance &amp; Capacity
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Objective delivery reliability, production effort, review efficiency, and real-time workload.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 bg-[#f5f5f7] p-1 rounded-full border border-black/[0.06] text-[13px] self-start md:self-auto">
          <button
            onClick={() => setViewMode("scorecards")}
            className={`px-4 py-1.5 rounded-full font-medium transition ${
              viewMode === "scorecards" ? "bg-white text-[#1d1d1f] shadow-sm font-semibold" : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Designer Metric Summaries
          </button>
          <button
            onClick={() => setViewMode("workload")}
            className={`px-4 py-1.5 rounded-full font-medium transition ${
              viewMode === "workload" ? "bg-white text-[#1d1d1f] shadow-sm font-semibold" : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Live Workload &amp; Capacity ({workload.length})
          </button>
        </div>
      </div>

      {/* Unified Filter Bar */}
      <div className="bg-white border border-black/[0.08] p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <div className="flex items-center gap-2 text-[#86868b] font-medium">
          <Filter className="h-4 w-4 text-[#0071e3]" /> Filters:
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end">
          {/* Date Range Selector */}
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

          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[#1d1d1f] font-medium focus:outline-none max-w-[200px]"
          >
            <option value="all">All Projects ({permittedProjects.length})</option>
            {permittedProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Designer Filter */}
          <select
            value={selectedDesignerId}
            onChange={(e) => setSelectedDesignerId(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[#1d1d1f] font-medium focus:outline-none max-w-[180px]"
          >
            <option value="all">All Designers ({designersList.length})</option>
            {designersList.map((d) => (
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

      {/* Top-Level Team KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Output */}
        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Completed Output
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f] flex items-baseline gap-1.5">
            <span>{overview.completedDeliverablesCount}</span>
            <span className="text-[12px] text-[#86868b] font-normal">
              ({overview.completedConceptsCount} concepts)
            </span>
          </div>
          <span className="text-[11px] text-[#86868b]">Deliverables completed</span>
        </div>

        {/* On-Time Delivery */}
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

        {/* First-Pass Approval */}
        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            First-Pass Approval
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f]">
            {overview.firstPassApprovalRate !== null ? `${overview.firstPassApprovalRate}%` : "—"}
          </div>
          <span className="text-[11px] text-[#86868b]">
            {overview.firstPassEligibleCount > 0
              ? `${overview.firstPassApprovedCount}/${overview.firstPassEligibleCount} review cycles`
              : "Insufficient data"}
          </span>
        </div>

        {/* Avg Revision Rounds */}
        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Avg Revision Cycles
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f]">
            {overview.avgRevisionRounds !== null ? overview.avgRevisionRounds : "—"}
          </div>
          <span className="text-[11px] text-[#86868b]">
            {overview.totalRevisionCyclesCount} formal CR resubmissions
          </span>
        </div>

        {/* Production Time */}
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
            {formatDurationHuman(overview.totalTrackedSeconds)} verified total
          </span>
        </div>

        {/* Team Presence & Timers */}
        <div className="p-4 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Team Presence Today
          </span>
          <div className="text-[24px] font-bold text-[#1d1d1f]">
            {overview.teamCheckedInTodayCount}/{overview.totalTeamMembersCount}
          </div>
          <span className="text-[11px] text-[#0071e3] font-medium flex items-center gap-1">
            <Timer className="h-3 w-3" /> {overview.activeTimersCount} active timer(s)
          </span>
        </div>
      </div>

      {/* VIEW A: DESIGNER SCORECARDS TABLE */}
      {viewMode === "scorecards" && (
        <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
            <div>
              <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
                <Users className="h-5 w-5 text-[#0071e3]" /> Designer Performance Metrics
              </h2>
              <p className="text-[12px] text-[#86868b]">
                Objective operational metrics across delivery, revision cycles, production effort, and active workload.
              </p>
            </div>

            <span className="text-[12px] text-[#86868b]">
              Showing {scorecards.length} designer(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] text-[#1d1d1f]">
              <thead className="bg-[#f5f5f7] text-[#6e6e73] text-[12px] font-semibold border-b border-black/[0.08]">
                <tr>
                  <th className="p-3.5 pl-4">Designer</th>
                  <th className="p-3.5">Output (Deliv / Concept)</th>
                  <th className="p-3.5">On-Time %</th>
                  <th className="p-3.5">First-Pass %</th>
                  <th className="p-3.5">Avg Revisions</th>
                  <th className="p-3.5">Avg Prod Time</th>
                  <th className="p-3.5">Tracked Time</th>
                  <th className="p-3.5">Active Tasks</th>
                  <th className="p-3.5">Overdue</th>
                  <th className="p-3.5 pr-4 text-right">Drilldown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {scorecards.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-[#86868b]">
                      No designers match the current filter selection.
                    </td>
                  </tr>
                ) : (
                  scorecards.map((sc) => (
                    <tr key={sc.userId} className="hover:bg-[#fbfbfd] transition">
                      <td className="p-3.5 pl-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold flex items-center justify-center text-[12px] border border-black/[0.06]">
                            {sc.avatar || "D"}
                          </div>
                          <div>
                            <Link
                              href={`/performance/${sc.userId}`}
                              className="font-semibold text-[#1d1d1f] hover:text-[#0071e3] hover:underline"
                            >
                              {sc.name}
                            </Link>
                            <div className="text-[11px] text-[#86868b] flex items-center gap-1.5">
                              <span>{sc.jobTitle || sc.role}</span>
                              {sc.userStatus === "inactive" && (
                                <span className="text-[10px] text-[#b42318] bg-[#fff0ee] px-1.5 py-0.2 rounded font-medium">
                                  Inactive
                                </span>
                              )}
                              {sc.hasActiveTimer && (
                                <span className="text-[10px] text-[#0071e3] bg-[#eaf4ff] px-1.5 py-0.2 rounded font-medium flex items-center gap-0.5">
                                  <Timer className="h-2.5 w-2.5" /> Working
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5 font-medium">
                        {sc.completedDeliverablesCount}{" "}
                        <span className="text-[11px] text-[#86868b]">({sc.completedConceptsCount} c.)</span>
                      </td>

                      <td className="p-3.5 font-mono">
                        {sc.onTimeDeliveryRate !== null ? (
                          <span
                            className={
                              sc.onTimeDeliveryRate >= 85
                                ? "text-[#1f6f32] font-semibold"
                                : sc.onTimeDeliveryRate >= 70
                                ? "text-[#9a6700]"
                                : "text-[#b42318]"
                            }
                          >
                            {sc.onTimeDeliveryRate}%
                          </span>
                        ) : (
                          <span className="text-[#86868b]">—</span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono">
                        {sc.firstPassApprovalRate !== null ? (
                          <span
                            className={
                              sc.firstPassApprovalRate >= 75
                                ? "text-[#1f6f32] font-semibold"
                                : sc.firstPassApprovalRate >= 60
                                ? "text-[#9a6700]"
                                : "text-[#b42318]"
                            }
                          >
                            {sc.firstPassApprovalRate}%
                          </span>
                        ) : (
                          <span className="text-[#86868b]">—</span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono text-[#1d1d1f]">
                        {sc.avgRevisionRounds !== null ? sc.avgRevisionRounds : "—"}
                      </td>

                      <td className="p-3.5 font-mono text-[#1d1d1f]">
                        {sc.avgProductionTimeSeconds !== null
                          ? formatDurationHuman(sc.avgProductionTimeSeconds)
                          : "—"}
                      </td>

                      <td className="p-3.5 font-mono text-[#86868b]">
                        {formatDurationHuman(sc.totalTrackedSeconds)}
                      </td>

                      <td className="p-3.5 font-medium">
                        {sc.activeAssignmentsCount}
                      </td>

                      <td className="p-3.5">
                        {sc.overdueCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#b42318] bg-[#fff0ee] px-2 py-0.5 rounded-full border border-[#ffd5d0]">
                            <AlertCircle className="h-3 w-3" /> {sc.overdueCount}
                          </span>
                        ) : (
                          <span className="text-[#1f6f32] text-[12px]">0</span>
                        )}
                      </td>

                      <td className="p-3.5 pr-4 text-right">
                        <Link
                          href={`/performance/${sc.userId}`}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0066cc] hover:underline"
                        >
                          View Details <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW B: REAL-TIME WORKLOAD & CAPACITY BOARD */}
      {viewMode === "workload" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
                <FolderKanban className="h-5 w-5 text-[#0071e3]" /> Real-Time Workload &amp; Capacity Board
              </h2>
              <p className="text-[12px] text-[#86868b]">
                Current active tasks, running work timers, deadline pressure, and attendance presence.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workload.map((w) => (
              <div
                key={w.userId}
                className={`bg-white border rounded-3xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-5 transition ${
                  w.capacityRisk ? "border-[#ffd5d0] bg-[#fffdfd]" : "border-black/[0.08]"
                }`}
              >
                {/* Designer Card Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl bg-[#f2f2f7] text-[#1d1d1f] font-bold flex items-center justify-center text-[15px] border border-black/[0.06]">
                      {w.avatar || "D"}
                    </div>
                    <div>
                      <Link
                        href={`/performance/${w.userId}`}
                        className="font-bold text-[16px] text-[#1d1d1f] hover:text-[#0071e3] hover:underline"
                      >
                        {w.name}
                      </Link>
                      <div className="text-[12px] text-[#86868b] flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            w.attendanceStatus === "checked_in"
                              ? "bg-[#34c759]"
                              : w.attendanceStatus === "checked_out"
                              ? "bg-[#86868b]"
                              : "bg-[#d1d1d6]"
                          }`}
                        />
                        <span className="capitalize">
                          {w.attendanceStatus === "checked_in"
                            ? `Present (${w.checkInTime ? new Date(w.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today"})`
                            : w.attendanceStatus === "checked_out"
                            ? "Checked Out"
                            : "Not Checked In"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/performance/${w.userId}`}
                    className="p-1.5 rounded-full hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]"
                    title="View Drilldown"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                {/* Capacity Risk Alert (Explainable) */}
                {w.capacityRisk && (
                  <div className="p-3 bg-[#fff0ee] border border-[#ffd5d0] rounded-xl flex items-start gap-2 text-[12px] text-[#b42318]">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Capacity Warning</span>
                      <span>{w.capacityRiskReason}</span>
                    </div>
                  </div>
                )}

                {/* Live Work Timer Status */}
                <div className="p-3.5 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                    <span>Active Work Timer</span>
                    {w.hasActiveTimer ? (
                      <span className="text-[#0071e3] flex items-center gap-1 font-bold animate-pulse">
                        <Timer className="h-3 w-3" /> Running
                      </span>
                    ) : (
                      <span className="text-[#86868b]">Idle</span>
                    )}
                  </div>
                  {w.hasActiveTimer ? (
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[13px] text-[#1d1d1f] truncate">
                        {w.activeTimerTaskTitle || "Working Deliverable"}
                      </div>
                      <div className="text-[11px] text-[#86868b] truncate">
                        {w.activeTimerProjectName} • {w.activeTimerItemPlatform}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[12px] text-[#86868b]">No active timer running.</div>
                  )}
                </div>

                {/* Assignment Metrics Breakdown */}
                <div className="grid grid-cols-4 gap-2 text-center text-[12px]">
                  <div className="p-2.5 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                    <span className="text-[10px] text-[#86868b] block font-semibold">Active</span>
                    <span className="text-[16px] font-bold text-[#1d1d1f]">
                      {w.activeAssignmentsCount}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                    <span className="text-[10px] text-[#86868b] block font-semibold">Due Today</span>
                    <span className="text-[16px] font-bold text-[#0071e3]">
                      {w.dueTodayCount}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                    <span className="text-[10px] text-[#86868b] block font-semibold">This Week</span>
                    <span className="text-[16px] font-bold text-[#1d1d1f]">
                      {w.dueThisWeekCount}
                    </span>
                  </div>

                  <div className={`p-2.5 rounded-xl border ${w.overdueCount > 0 ? "bg-[#fff0ee] border-[#ffd5d0]" : "bg-[#fbfbfd] border-black/[0.04]"}`}>
                    <span className={`text-[10px] block font-semibold ${w.overdueCount > 0 ? "text-[#b42318]" : "text-[#86868b]"}`}>
                      Overdue
                    </span>
                    <span className={`text-[16px] font-bold ${w.overdueCount > 0 ? "text-[#b42318]" : "text-[#1d1d1f]"}`}>
                      {w.overdueCount}
                    </span>
                  </div>
                </div>

                {/* Active Deliverables Snippet */}
                {w.activeAssignments.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-black/[0.04]">
                    <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                      Active Queue ({w.activeAssignments.length})
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {w.activeAssignments.slice(0, 3).map((task) => (
                        <div
                          key={task.assignmentId}
                          className="p-2 bg-[#fbfbfd] border border-black/[0.04] rounded-xl text-[12px] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[#1d1d1f] truncate">{task.title}</div>
                            <div className="text-[10px] text-[#86868b] truncate">
                              {task.projectName} • {task.platform}
                            </div>
                          </div>
                          {task.isOverdue && (
                            <span className="text-[10px] font-bold text-[#b42318] bg-[#fff0ee] px-1.5 py-0.5 rounded">
                              Overdue
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer: Tracked Today */}
                <div className="pt-3 border-t border-black/[0.04] flex items-center justify-between text-[12px] text-[#86868b]">
                  <span>Tracked Today:</span>
                  <span className="font-mono font-semibold text-[#1d1d1f]">
                    {formatDurationHuman(w.trackedTodaySeconds)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
