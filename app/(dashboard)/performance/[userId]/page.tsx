"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  FolderKanban,
  Layers,
  LineChart,
  Lock,
  PieChart,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { getDesignerPerformanceDetail, PerformanceFilters } from "@/lib/performance";
import { formatDate, formatDateTime, formatDurationHuman } from "@/lib/formatters";

export default function DesignerPerformanceDetailPage() {
  const params = useParams();
  const targetUserId = (params?.userId as string) || "";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  const filters: PerformanceFilters = {
    dateRange,
    projectId: selectedProjectId,
  };

  const detailResult = getDesignerPerformanceDetail(state, targetUserId, activeUserId, activeRole, filters);

  if (detailResult.status === 403 || !detailResult.data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-center animate-in fade-in">
        <div className="max-w-md w-full rounded-3xl border border-black/[0.08] bg-white p-8 space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto border border-[#ffd5d0]">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1d1d1f]">Access Restricted</h2>
          <p className="text-[14px] text-[#6e6e73] leading-relaxed">
            {detailResult.error || "You do not have authorization to view this designer's detailed performance record."}
          </p>
          <Link
            href="/performance"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white shadow-sm"
          >
            Back to Team Performance
          </Link>
        </div>
      </div>
    );
  }

  const { user, productivity, delivery, reviewEfficiency, trends, attendanceContext } = detailResult.data;

  // Permitted projects
  const permittedProjects = state.projects.filter((p) => {
    if (activeRole === "founder" || activeRole === "admin") return true;
    return state.projectMemberships.some(
      (m) => m.projectId === p.id && m.userId === activeUserId && m.status === "active"
    );
  });

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Top Breadcrumb / Back Link */}
      <div className="flex items-center justify-between">
        <Link
          href="/performance"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Team Performance
        </Link>

        <Link
          href={`/team/${targetUserId}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1 text-[12px] font-medium text-[#1d1d1f] border border-black/[0.06] transition"
        >
          <User className="h-3.5 w-3.5 text-[#0071e3]" /> View Team Profile
        </Link>
      </div>

      {/* Designer Profile Header Banner */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-3xl bg-[#1d1d1f] text-white flex items-center justify-center font-bold text-[22px] shadow-sm">
            {user.avatar || "D"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] sm:text-[30px] font-bold text-[#1d1d1f] tracking-tight">
                {user.name}
              </h1>
              {user.status === "inactive" && (
                <span className="text-[11px] font-semibold text-[#b42318] bg-[#fff0ee] px-2.5 py-0.5 rounded-full border border-[#ffd5d0]">
                  Inactive Account
                </span>
              )}
            </div>
            <div className="text-[13px] text-[#6e6e73] flex flex-wrap items-center gap-2 mt-0.5">
              <span>{user.jobTitle || user.role}</span>
              <span>• {user.email}</span>
              <span>• Joined {formatDate(user.dateJoined)}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[13px] text-[#1d1d1f] font-semibold focus:outline-none"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[13px] text-[#1d1d1f] font-semibold focus:outline-none max-w-[200px]"
          >
            <option value="all">All Permitted Projects</option>
            {permittedProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SECTION A: PRODUCTIVITY & EFFORT */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-6">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-[#0071e3]" /> A. Productivity &amp; Output Effort
          </h2>
          <span className="text-[12px] text-[#86868b]">
            Authoritative WorkSession durations &amp; completion events
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Completed Output
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {productivity.completedDeliverablesCount}
            </div>
            <span className="text-[11px] text-[#86868b]">
              Across {productivity.completedConceptsCount} creative concepts
            </span>
          </div>

          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Total Tracked Work
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {formatDurationHuman(productivity.totalTrackedSeconds)}
            </div>
            <span className="text-[11px] text-[#86868b]">Verified session ledger</span>
          </div>

          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Avg Production Time
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {productivity.avgProductionTimeSeconds !== null
                ? formatDurationHuman(productivity.avgProductionTimeSeconds)
                : "—"}
            </div>
            <span className="text-[11px] text-[#86868b]">Per completed deliverable</span>
          </div>

          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Active Queue
            </span>
            <div className="text-[24px] font-bold text-[#0071e3]">
              {productivity.activeAssignmentsCount}
            </div>
            <span className="text-[11px] text-[#86868b]">
              {productivity.completedAssignmentsCount} completed historically
            </span>
          </div>
        </div>

        {/* Content Type & Platform Distribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* By Content Type */}
          <div className="p-5 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-3">
            <h3 className="font-bold text-[14px] text-[#1d1d1f]">Effort by Content Type</h3>
            <div className="space-y-2 text-[13px]">
              {Object.keys(productivity.timeByContentType).length === 0 ? (
                <p className="text-[12px] text-[#86868b]">No tracked production time recorded yet.</p>
              ) : (
                Object.entries(productivity.timeByContentType).map(([type, sec]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="capitalize text-[#6e6e73]">{type.replace(/_/g, " ")}:</span>
                    <span className="font-mono font-semibold text-[#1d1d1f]">
                      {formatDurationHuman(sec)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* By Platform */}
          <div className="p-5 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-3">
            <h3 className="font-bold text-[14px] text-[#1d1d1f]">Output by Platform</h3>
            <div className="space-y-2 text-[13px]">
              {Object.keys(productivity.outputByPlatform).length === 0 ? (
                <p className="text-[12px] text-[#86868b]">No deliverables completed yet.</p>
              ) : (
                Object.entries(productivity.outputByPlatform).map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">{platform}:</span>
                    <span className="font-semibold text-[#1d1d1f]">{count} deliverable(s)</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION B: DELIVERY RELIABILITY */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-6">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#0071e3]" /> B. Delivery Reliability &amp; Deadlines
          </h2>
          <span className="text-[12px] text-[#86868b]">
            First formal submissions evaluated against effective deadlines at submission time
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Initial Delivery On-Time
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {delivery.onTimeDeliveryRate !== null ? `${delivery.onTimeDeliveryRate}%` : "—"}
            </div>
            <span className="text-[11px] text-[#86868b]">
              {delivery.eligibleSubmissionsCount > 0
                ? `${delivery.onTimeDeliveriesCount}/${delivery.eligibleSubmissionsCount} submissions`
                : "Insufficient data"}
            </span>
          </div>

          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Avg Delay on Late Deliveries
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {delivery.avgDelayHoursOnLate !== null ? `${delivery.avgDelayHoursOnLate}h` : "—"}
            </div>
            <span className="text-[11px] text-[#86868b]">
              {delivery.lateDeliveriesCount} late initial submission(s)
            </span>
          </div>

          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Due Today / This Week
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {delivery.dueTodayCount} / {delivery.dueThisWeekCount}
            </div>
            <span className="text-[11px] text-[#86868b]">Near-term deadlines</span>
          </div>

          <div className={`p-4 rounded-2xl border space-y-1 ${delivery.overdueCount > 0 ? "bg-[#fff0ee] border-[#ffd5d0]" : "bg-[#fbfbfd] border-black/[0.04]"}`}>
            <span className={`text-[11px] font-semibold uppercase tracking-wider block ${delivery.overdueCount > 0 ? "text-[#b42318]" : "text-[#86868b]"}`}>
              Overdue Deliverables
            </span>
            <div className={`text-[24px] font-bold ${delivery.overdueCount > 0 ? "text-[#b42318]" : "text-[#1d1d1f]"}`}>
              {delivery.overdueCount}
            </div>
            <span className="text-[11px] text-[#86868b]">Past current deadline</span>
          </div>
        </div>

        {/* Delivery History Table */}
        {delivery.history.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="font-bold text-[14px] text-[#1d1d1f]">Submission Delivery Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] text-[#1d1d1f]">
                <thead className="bg-[#f5f5f7] text-[#6e6e73] font-semibold border-b border-black/[0.08]">
                  <tr>
                    <th className="p-2.5 pl-3">Deliverable</th>
                    <th className="p-2.5">Project</th>
                    <th className="p-2.5">Effective Due Date</th>
                    <th className="p-2.5">Submitted At</th>
                    <th className="p-2.5">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {delivery.history.map((h) => (
                    <tr key={h.contentItemId} className="hover:bg-[#fbfbfd]">
                      <td className="p-2.5 pl-3 font-semibold">{h.title}</td>
                      <td className="p-2.5 text-[#6e6e73]">{h.projectName}</td>
                      <td className="p-2.5 font-mono">{formatDateTime(h.effectiveDueAt)}</td>
                      <td className="p-2.5 font-mono">{formatDateTime(h.firstSubmittedAt)}</td>
                      <td className="p-2.5">
                        {h.isOnTime ? (
                          <span className="text-[#1f6f32] font-semibold bg-[#eaf6ed] px-2 py-0.5 rounded-full border border-[#ceead6]">
                            ✓ On Time
                          </span>
                        ) : (
                          <span className="text-[#b42318] font-semibold bg-[#fff0ee] px-2 py-0.5 rounded-full border border-[#ffd5d0]">
                            Late (+{h.delayHours}h)
                          </span>
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

      {/* SECTION C: REVIEW EFFICIENCY & REVISIONS */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-6">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-[#0071e3]" /> C. Review Efficiency &amp; Revisions
          </h2>
          <span className="text-[12px] text-[#86868b]">
            Formal change requests &amp; resubmission cycles (draft edits excluded)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              First-Pass Approval Rate
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {reviewEfficiency.firstPassApprovalRate !== null
                ? `${reviewEfficiency.firstPassApprovalRate}%`
                : "—"}
            </div>
            <span className="text-[11px] text-[#86868b]">
              {reviewEfficiency.firstPassEligibleCount > 0
                ? `${reviewEfficiency.firstPassApprovedCount}/${reviewEfficiency.firstPassEligibleCount} without changes requested`
                : "Insufficient data"}
            </span>
          </div>

          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Avg Revision Cycles
            </span>
            <div className="text-[24px] font-bold text-[#1d1d1f]">
              {reviewEfficiency.avgRevisionRounds !== null ? reviewEfficiency.avgRevisionRounds : "—"}
            </div>
            <span className="text-[11px] text-[#86868b]">
              {reviewEfficiency.totalChangeRequestsReceived} formal change request(s)
            </span>
          </div>

          <div className="p-4 bg-[#fbfbfd] border border-black/[0.04] rounded-2xl space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Revisions by Component
            </span>
            <div className="text-[12px] space-y-0.5 pt-1">
              <div className="flex justify-between text-[#6e6e73]">
                <span>Creative Assets:</span>
                <span className="font-semibold text-[#1d1d1f]">
                  {reviewEfficiency.revisionsByComponent.creative}
                </span>
              </div>
              <div className="flex justify-between text-[#6e6e73]">
                <span>Copy &amp; Caption:</span>
                <span className="font-semibold text-[#1d1d1f]">
                  {reviewEfficiency.revisionsByComponent.copy}
                </span>
              </div>
              <div className="flex justify-between text-[#6e6e73]">
                <span>Posting Date:</span>
                <span className="font-semibold text-[#1d1d1f]">
                  {reviewEfficiency.revisionsByComponent.posting_date}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION D: ATTENDANCE & CONTEXT */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#0071e3]" /> D. Presence &amp; Daily Context
          </h2>
          <span className="text-[12px] text-[#86868b]">
            Presence context (Asia/Kolkata) — not conflated with task production time
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Today&apos;s Status
            </span>
            <div className="text-[16px] font-bold text-[#1d1d1f]">
              {attendanceContext.isCheckedInToday ? "Checked In (Present)" : "Not Checked In"}
            </div>
            <span className="text-[11px] text-[#86868b]">
              {attendanceContext.todayCheckInTime
                ? `Check-in: ${new Date(attendanceContext.todayCheckInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "No check-in record today"}
            </span>
          </div>

          <div className="p-4 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Tracked Task Effort Today
            </span>
            <div className="text-[16px] font-bold text-[#1d1d1f]">
              {formatDurationHuman(attendanceContext.totalTrackedTodaySeconds)}
            </div>
            <span className="text-[11px] text-[#86868b]">Active WorkSession sum</span>
          </div>

          <div className="p-4 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Working Days Present
            </span>
            <div className="text-[16px] font-bold text-[#1d1d1f]">
              {attendanceContext.daysPresentInRange} day(s)
            </div>
            <span className="text-[11px] text-[#86868b]">Historical presence</span>
          </div>

          <div className="p-4 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-1">
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
              Daily Shift
            </span>
            <div className="text-[16px] font-bold text-[#1d1d1f]">
              {user.workingHoursPerDay || 8} hrs/day
            </div>
            <span className="text-[11px] text-[#86868b]">Standard scheduled shift</span>
          </div>
        </div>
      </div>
    </div>
  );
}
