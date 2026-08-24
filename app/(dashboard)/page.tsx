"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Pause,
  Play,
  Sparkles,
  Timer,
  UserCheck,
} from "lucide-react";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { formatDate } from "@/lib/formatters";

export default function MyWorkDashboardPage() {
  const { state, pauseWorkSession, checkInAttendance, checkOutAttendance } = useAppState();
  const { activeRole, activeUserId, canApprove, setActiveProjectId } = useRole();

  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const todayAttendance = state.attendanceRecords.find(
    (r) => r.userId === activeUserId && r.attendanceDate === todayDate
  );

  // Active running timer for current user
  const activeWorkSession = state.workSessions.find(
    (ws) => ws.userId === activeUserId && ws.status === "active"
  );
  const activeWorkItem = activeWorkSession
    ? state.contentItems.find((i) => i.id === activeWorkSession.contentItemId)
    : null;

  // Today's total tracked productive task seconds
  const todayWorkSeconds = state.workSessions
    .filter((ws) => ws.userId === activeUserId && ws.startedAt.startsWith(todayDate))
    .reduce((acc, ws) => {
      let s = ws.accumulatedSeconds;
      if (ws.status === "active" && ws.activeSegmentStartedAt) {
        s += Math.max(0, Math.floor((Date.now() - Date.parse(ws.activeSegmentStartedAt)) / 1000));
      }
      return acc + s;
    }, 0);

  const todayHours = Math.floor(todayWorkSeconds / 3600);
  const todayMins = Math.floor((todayWorkSeconds % 3600) / 60);

  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    if (!activeWorkSession) return;
    const interval = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeWorkSession]);

  // Get active user's assigned projects
  const accessibleProjectIds = new Set(
    activeRole === "admin" || activeRole === "founder"
      ? state.projects.map((p) => p.id)
      : state.projectMemberships
          .filter((m) => m.userId === activeUserId && m.status === "active")
          .map((m) => m.projectId)
  );

  // Items across accessible projects
  const accessibleItems = state.contentItems.filter((i) => accessibleProjectIds.has(i.projectId));

  // My assigned items
  const myAssignedItems = accessibleItems.filter(
    (i) => i.accountableOwnerId === activeUserId || i.collaboratorIds.includes(activeUserId)
  );

  // Approvals awaiting my decision (if founder or consultant)
  const itemsNeedingReview = accessibleItems.filter((i) => {
    if (i.stage !== "in_review" && i.stage !== "submitted") return false;
    const version = state.submissionVersions.find(
      (v) => v.id === i.latestSubmittedVersionId || v.id === i.activeDraftVersionId
    );
    const summary = getItemApprovalMatrixSummary(
      i,
      version,
      state.approvalDecisions,
      state.founderOverrides
    );
    if (activeRole === "founder") {
      return summary.copy.founder === "pending" || summary.creative.founder === "pending" || summary.posting_date.founder === "pending";
    }
    if (activeRole === "consultant") {
      return summary.copy.consultant === "pending" || summary.creative.consultant === "pending" || summary.posting_date.consultant === "pending";
    }
    return false;
  });

  // Open change requests needing designer response
  const openChangeRequests = state.changeRequests.filter(
    (cr) =>
      accessibleProjectIds.has(cr.projectId) &&
      cr.status === "open" &&
      (activeRole === "designer" || activeRole === "founder" || activeRole === "consultant")
  );

  // Overdue / approaching deadlines
  const now = new Date();
  const urgentItems = accessibleItems.filter((i) => {
    if (i.stage === "published" || i.stage === "approved") return false;
    const deadline = i.deadlines.resubmissionDeadline || i.deadlines.submissionDeadline;
    if (!deadline) return false;
    const dueTime = new Date(deadline).getTime();
    // Overdue or due within next 48 hours
    return dueTime < now.getTime() + 48 * 3600 * 1000;
  });

  return (
    <div className="flex-1 p-8 sm:p-10 max-w-7xl mx-auto w-full space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <Briefcase className="h-7 w-7 text-[#0071e3]" />
            <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight text-[#1d1d1f]">
              Cross-Project My Work
            </h1>
          </div>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Personalized operational work queue across all accessible workspace projects.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="flex items-center gap-2 rounded-full bg-[#ffffff] hover:bg-[#f5f5f7] text-[#1d1d1f] border border-black/[0.08] px-4 py-2 text-[13px] font-medium transition shadow-sm"
          >
            <Layers className="h-4 w-4 text-[#0071e3]" /> View Project Portfolio
          </Link>
        </div>
      </div>

      {/* TODAY'S ATTENDANCE & EFFORT OVERVIEW (Phase 2.1) */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-3xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#0071e3]" />
            <h2 className="text-[16px] font-bold text-[#1d1d1f]">Today&apos;s Status (Asia/Kolkata)</h2>
          </div>
          <span className="text-[12px] text-[#86868b] font-medium">Date: {todayDate}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Attendance Box */}
          <div className="p-4 rounded-2xl bg-[#fbfbfd] border border-black/[0.04] flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                Daily Attendance
              </span>
              <div className="mt-1">
                {todayAttendance?.status === "checked_in" ? (
                  <div>
                    <span className="text-[18px] font-bold text-[#1f6f32] flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Checked In
                    </span>
                    <span className="text-[12px] text-[#6e6e73]">
                      Arrived at {new Date(todayAttendance.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ) : todayAttendance?.status === "checked_out" ? (
                  <div>
                    <span className="text-[18px] font-bold text-[#9a6700]">
                      Checked Out
                    </span>
                    <span className="text-[12px] text-[#6e6e73]">
                      Ended at {new Date(todayAttendance.checkedOutAt || "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-[18px] font-bold text-[#86868b]">
                      Not Checked In
                    </span>
                    <span className="text-[12px] text-[#6e6e73]">
                      Record your daily shift arrival
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div>
              {todayAttendance?.status === "checked_in" ? (
                <button
                  onClick={() => checkOutAttendance(activeUserId)}
                  className="w-full rounded-xl bg-[#fff0ee] hover:bg-[#ffd5d0] text-[#b42318] py-2 text-[12px] font-semibold transition"
                >
                  Check Out for the Day
                </button>
              ) : (
                <button
                  onClick={() => checkInAttendance(activeUserId)}
                  className="w-full rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white py-2 text-[12px] font-semibold shadow-sm transition"
                >
                  Check In Now
                </button>
              )}
            </div>
          </div>

          {/* Tracked Work Today */}
          <div className="p-4 rounded-2xl bg-[#fbfbfd] border border-black/[0.04] flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                Tracked Work Today
              </span>
              <div className="mt-1">
                <span className="text-[26px] font-bold text-[#1d1d1f]">
                  {todayHours}h {todayMins}m
                </span>
                <span className="text-[12px] text-[#6e6e73] block mt-0.5">
                  Sum of verified task work sessions
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[#86868b] bg-white p-2 rounded-xl border border-black/[0.04]">
              Work sessions track task effort independently of attendance presence.
            </div>
          </div>

          {/* Current Task Activity */}
          <div className="p-4 rounded-2xl bg-[#fbfbfd] border border-black/[0.04] flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                Current Task
              </span>
              <div className="mt-1">
                {activeWorkSession && activeWorkItem ? (
                  <div>
                    <span className="text-[14px] font-bold text-[#0066cc] truncate block">
                      {activeWorkItem.title}
                    </span>
                    <span className="text-[12px] text-[#86868b] block">
                      Platform: {activeWorkItem.platform}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-[14px] font-medium text-[#86868b] block">
                      No active task timer.
                    </span>
                    <span className="text-[12px] text-[#6e6e73] block">
                      Open an assigned deliverable to start work.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {activeWorkSession && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => pauseWorkSession(activeWorkSession.id, activeUserId)}
                  className="flex-1 rounded-xl bg-[#fff8e6] hover:bg-[#ffe082] text-[#9a6700] py-2 text-[12px] font-semibold transition"
                >
                  Pause Timer
                </button>
                <Link
                  href={`/projects/${activeWorkSession.projectId}/content/${activeWorkSession.contentItemId}`}
                  className="flex-1 text-center rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white py-2 text-[12px] font-semibold transition shadow-sm"
                >
                  Workspace →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Work Session Live Banner (Phase 2) */}
      {activeWorkSession && activeWorkItem && (
        <div className="bg-[#1d1d1f] text-white rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-full bg-[#34c759]/20 text-[#34c759] flex items-center justify-center font-bold shrink-0 animate-pulse">
              <Timer className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider bg-[#34c759]/20 text-[#34c759] px-2 py-0.5 rounded-full">
                  Tracking Live
                </span>
                <span className="text-[13px] text-[#86868b]">{activeWorkItem.platform}</span>
              </div>
              <h3 className="font-semibold text-[15px] text-white truncate max-w-lg mt-0.5">
                {activeWorkItem.title}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[11px] text-[#86868b] block">Elapsed Duration:</span>
              <span className="text-[22px] font-mono font-bold text-white tracking-tight">
                {(() => {
                  const elapsed =
                    activeWorkSession.accumulatedSeconds +
                    Math.max(
                      0,
                      Math.floor((Date.now() - Date.parse(activeWorkSession.activeSegmentStartedAt || "")) / 1000)
                    );
                  const hrs = Math.floor(elapsed / 3600);
                  const mins = Math.floor((elapsed % 3600) / 60);
                  const secs = elapsed % 60;
                  if (hrs > 0) {
                    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
                  }
                  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
                })()}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => pauseWorkSession(activeWorkSession.id, activeUserId)}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium transition"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
              <Link
                href={`/projects/${activeWorkSession.projectId}/content/${activeWorkSession.contentItemId}`}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-[13px] font-medium transition shadow-sm"
              >
                Open Workspace <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Project Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Assigned To Me</div>
          <div className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">{myAssignedItems.length}</div>
          <div className="text-[12px] text-[#86868b]">Deliverables under your ownership</div>
        </div>

        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Awaiting My Review</div>
          <div className="text-[32px] font-bold text-[#9a6700] tracking-tight">{itemsNeedingReview.length}</div>
          <div className="text-[12px] text-[#86868b]">Pending your component decisions</div>
        </div>

        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Open Change Requests</div>
          <div className="text-[32px] font-bold text-[#d70015] tracking-tight">{openChangeRequests.length}</div>
          <div className="text-[12px] text-[#86868b]">Requires Designer response</div>
        </div>

        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Due Soon / Overdue</div>
          <div className="text-[32px] font-bold text-[#0071e3] tracking-tight">{urgentItems.length}</div>
          <div className="text-[12px] text-[#86868b]">Deadlines within 48 hours</div>
        </div>
      </div>

      {/* 2-Column Work Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approvals Requiring Action (Founder / Consultant) */}
        {canApprove && (
          <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#9a6700]" />
                <h3 className="font-semibold text-[#1d1d1f] text-[16px]">Items Awaiting Your Approval</h3>
              </div>
              <span className="text-[12px] font-bold status-review rounded-full px-2.5 py-0.5">
                {itemsNeedingReview.length} Items
              </span>
            </div>

            <div className="space-y-3">
              {itemsNeedingReview.length === 0 ? (
                <div className="py-10 text-center text-[13px] text-[#86868b]">
                  You have no pending items waiting for your approval.
                </div>
              ) : (
                itemsNeedingReview.map((item) => {
                  const proj = state.projects.find((p) => p.id === item.projectId);
                  return (
                    <Link
                      key={item.id}
                      href={`/projects/${item.projectId}/content/${item.id}`}
                      onClick={() => setActiveProjectId(item.projectId)}
                      className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#0071e3]/50 hover:bg-[#f5f5f7] transition space-y-1.5 group"
                    >
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                        <span className="text-[#86868b]">{item.platform} • {item.contentType}</span>
                      </div>
                      <div className="font-semibold text-[14px] text-[#1d1d1f] group-hover:text-[#0066cc] transition truncate">
                        {item.title}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Change Requests Requiring Action (Designer) */}
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#d70015]" />
              <h3 className="font-semibold text-[#1d1d1f] text-[16px]">Open Change Requests</h3>
            </div>
            <span className="text-[12px] font-bold status-changes rounded-full px-2.5 py-0.5">
              {openChangeRequests.length} Open
            </span>
          </div>

          <div className="space-y-3">
            {openChangeRequests.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#86868b]">
                No open change requests across your projects.
              </div>
            ) : (
              openChangeRequests.map((cr) => {
                const item = state.contentItems.find((i) => i.id === cr.contentItemId);
                const proj = state.projects.find((p) => p.id === cr.projectId);
                return (
                  <Link
                    key={cr.id}
                    href={`/projects/${cr.projectId}/content/${cr.contentItemId}`}
                    onClick={() => setActiveProjectId(cr.projectId)}
                    className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#d70015]/50 hover:bg-[#f5f5f7] transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                      <span className="status-changes rounded-full px-2 py-0.2 font-bold text-[11px] uppercase">
                        {cr.component}
                      </span>
                    </div>
                    <div className="font-semibold text-[14px] text-[#1d1d1f] truncate">{item?.title}</div>
                    <p className="text-[13px] text-[#6e6e73] line-clamp-1 italic">"{cr.requestedChange}"</p>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Assigned Deliverables */}
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#0071e3]" />
              <h3 className="font-semibold text-[#1d1d1f] text-[16px]">My Active Assignments</h3>
            </div>
            <span className="text-[12px] font-medium rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[#1d1d1f]">
              {myAssignedItems.length} Items
            </span>
          </div>

          <div className="space-y-3">
            {myAssignedItems.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#86868b]">
                No items directly assigned to you at this time.
              </div>
            ) : (
              myAssignedItems.map((item) => {
                const proj = state.projects.find((p) => p.id === item.projectId);
                return (
                  <Link
                    key={item.id}
                    href={`/projects/${item.projectId}/content/${item.id}`}
                    onClick={() => setActiveProjectId(item.projectId)}
                    className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#0071e3]/50 hover:bg-[#f5f5f7] transition space-y-1 group"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                      <span className="text-[#86868b] capitalize">{item.stage.replace("_", " ")}</span>
                    </div>
                    <div className="font-semibold text-[14px] text-[#1d1d1f] group-hover:text-[#0066cc] transition truncate">
                      {item.title}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Deadlines within 48 Hours */}
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#0071e3]" />
              <h3 className="font-semibold text-[#1d1d1f] text-[16px]">Approaching Deadlines</h3>
            </div>
            <span className="text-[12px] font-bold status-review rounded-full px-2.5 py-0.5">
              {urgentItems.length} Urgent
            </span>
          </div>

          <div className="space-y-3">
            {urgentItems.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#86868b]">
                No approaching deadlines within 48 hours.
              </div>
            ) : (
              urgentItems.map((item) => {
                const proj = state.projects.find((p) => p.id === item.projectId);
                const deadline = item.deadlines.resubmissionDeadline || item.deadlines.submissionDeadline;
                return (
                  <Link
                    key={item.id}
                    href={`/projects/${item.projectId}/content/${item.id}`}
                    onClick={() => setActiveProjectId(item.projectId)}
                    className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#0071e3]/50 hover:bg-[#f5f5f7] transition space-y-1 group"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                      <span className="text-[#9a6700] font-bold">
                        {formatDate(deadline)}
                      </span>
                    </div>
                    <div className="font-semibold text-[14px] text-[#1d1d1f] group-hover:text-[#0066cc] transition truncate">
                      {item.title}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
