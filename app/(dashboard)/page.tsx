"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  LogOut,
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

  // Dynamic live IST date and time
  const [liveISTTime, setLiveISTTime] = useState("");
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  useEffect(() => {
    const updateTime = () => {
      const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date());
      setLiveISTTime(formatted);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const todayAttendance = state.attendanceRecords.find(
    (r) => r.userId === activeUserId && r.attendanceDate === todayDate
  );

  // Attendance Submission State Guard (Anti-double click & inline feedback)
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [attendanceNotice, setAttendanceNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleCheckIn = () => {
    if (isSubmittingAttendance) return;
    setIsSubmittingAttendance(true);
    setAttendanceNotice(null);

    const res = checkInAttendance(activeUserId);
    setIsSubmittingAttendance(false);

    if (res.success) {
      setAttendanceNotice({ type: "success", text: "Checked in successfully for today." });
      setTimeout(() => setAttendanceNotice(null), 3000);
    } else {
      setAttendanceNotice({ type: "error", text: res.error || "Failed to record check in." });
    }
  };

  const handleCheckOut = () => {
    if (isSubmittingAttendance) return;
    setIsSubmittingAttendance(true);
    setAttendanceNotice(null);

    const res = checkOutAttendance(activeUserId);
    setIsSubmittingAttendance(false);

    if (res.success) {
      setAttendanceNotice({ type: "success", text: "Checked out successfully for today." });
      setTimeout(() => setAttendanceNotice(null), 3000);
    } else {
      setAttendanceNotice({ type: "error", text: res.error || "Failed to record check out." });
    }
  };

  // Active running timer for current user
  const activeWorkSession = state.workSessions.find(
    (ws) => ws.userId === activeUserId && ws.status === "active"
  );
  const activeWorkItem = activeWorkSession
    ? state.contentItems.find((i) => i.id === activeWorkSession.contentItemId)
    : null;
  const activeProject = activeWorkItem
    ? state.projects.find((p) => p.id === activeWorkItem.projectId)
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
      return (
        summary.copy.founder === "pending" ||
        summary.creative.founder === "pending" ||
        summary.posting_date.founder === "pending"
      );
    }
    if (activeRole === "consultant") {
      return (
        summary.copy.consultant === "pending" ||
        summary.creative.consultant === "pending" ||
        summary.posting_date.consultant === "pending"
      );
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
    return dueTime < now.getTime() + 48 * 3600 * 1000;
  });

  return (
    <div className="flex-1 p-8 sm:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <Briefcase className="h-7 w-7 text-[#0071e3]" />
            <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight text-[#1d1d1f]">
              Cross-Project My Work
            </h1>
          </div>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Personalized operational queue and attendance presence for{" "}
            <span className="font-semibold text-[#1d1d1f]">Asia/Kolkata (IST)</span>.
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

      {/* ATTENDANCE & WORK TIMER PANELS (Clean Apple Separation) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. TODAY'S ATTENDANCE CARD */}
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[22px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#0071e3]" />
                <h2 className="text-[16px] font-bold text-[#1d1d1f]">Today&apos;s Attendance</h2>
              </div>

              {todayAttendance?.status === "checked_in" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Checked In
                </span>
              ) : todayAttendance?.status === "checked_out" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#f2f2f7] text-[#6e6e73] border border-black/[0.06]">
                  Checked Out
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#fff8e6] text-[#9a6700] border border-[#f2e2a8]">
                  Not Checked In
                </span>
              )}
            </div>

            {/* Attendance Content */}
            <div className="space-y-2">
              {todayAttendance?.status === "checked_in" ? (
                <div className="space-y-1">
                  <div className="text-[20px] font-bold text-[#1d1d1f]">
                    Checked in at{" "}
                    {new Date(todayAttendance.checkedInAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-[13px] text-[#6e6e73] flex items-center gap-2">
                    <span>Current Time: <strong>{liveISTTime || "—"}</strong></span>
                    <span>• Status: Active Shift Presence</span>
                  </div>
                </div>
              ) : todayAttendance?.status === "checked_out" ? (
                <div className="space-y-1">
                  <div className="text-[20px] font-bold text-[#1d1d1f]">
                    Shift Completed for Today
                  </div>
                  <div className="text-[13px] text-[#6e6e73]">
                    Recorded hours:{" "}
                    {new Date(todayAttendance.checkedInAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {new Date(todayAttendance.checkedOutAt || "").toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-[18px] font-semibold text-[#1d1d1f]">
                    You haven&apos;t checked in today.
                  </div>
                  <div className="text-[13px] text-[#6e6e73]">
                    Confirm your daily shift presence in <strong className="text-[#1d1d1f]">Asia/Kolkata</strong>.
                  </div>
                </div>
              )}
            </div>

            {/* Feedback notice */}
            {attendanceNotice && (
              <div
                className={`p-2.5 rounded-xl text-[12px] flex items-center gap-2 animate-in fade-in ${
                  attendanceNotice.type === "success"
                    ? "bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]"
                    : "bg-[#fff0ee] text-[#b42318] border border-[#ffd5d0]"
                }`}
              >
                {attendanceNotice.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{attendanceNotice.text}</span>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="pt-2 border-t border-black/[0.04]">
            {todayAttendance?.status === "checked_in" ? (
              <button
                onClick={handleCheckOut}
                disabled={isSubmittingAttendance}
                className="w-full rounded-xl bg-[#fff0ee] hover:bg-[#ffd5d0] text-[#b42318] py-2.5 text-[13px] font-semibold transition border border-[#ffd5d0] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" /> Check Out for the Day
              </button>
            ) : todayAttendance?.status === "checked_out" ? (
              <div className="text-center text-[12px] font-medium text-[#86868b] py-2 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                Shift presence closed. Thank you!
              </div>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={isSubmittingAttendance}
                className="w-full rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white py-2.5 text-[13px] font-semibold shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Check In Now
              </button>
            )}
          </div>
        </div>

        {/* 2. CURRENT TASK & WORK TIMER CARD */}
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[22px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-[#0071e3]" />
                <h2 className="text-[16px] font-bold text-[#1d1d1f]">Productivity Work Timer</h2>
              </div>

              {activeWorkSession ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6] animate-pulse">
                  Timer Active
                </span>
              ) : (
                <span className="text-[12px] font-semibold text-[#86868b] bg-[#f2f2f7] px-3 py-1 rounded-full">
                  Timer Idle
                </span>
              )}
            </div>

            {activeWorkSession && activeWorkItem ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#f0f7ff] text-[#0071e3]">
                    {activeProject?.clientBrand || activeProject?.name || "Project"}
                  </span>
                  <span className="text-[12px] text-[#86868b]">{activeWorkItem.platform} • {activeWorkItem.contentType}</span>
                </div>
                <h3 className="text-[17px] font-bold text-[#1d1d1f] truncate">
                  {activeWorkItem.title}
                </h3>
                <div className="text-[28px] font-mono font-bold text-[#0071e3] tracking-tight">
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
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[18px] font-semibold text-[#1d1d1f]">
                  No task timer running.
                </div>
                <div className="text-[13px] text-[#6e6e73]">
                  Select an accepted assignment from below and click &quot;Start Work&quot; to begin tracking time.
                </div>
                <div className="pt-2 text-[13px] text-[#86868b]">
                  Verified productive time today: <strong className="text-[#1d1d1f]">{todayHours}h {todayMins}m</strong>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-black/[0.04]">
            {activeWorkSession && activeWorkItem ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => pauseWorkSession(activeWorkSession.id, activeUserId)}
                  className="flex-1 rounded-xl bg-[#fff8e6] hover:bg-[#ffe082] text-[#9a6700] py-2.5 text-[13px] font-semibold transition flex items-center justify-center gap-1.5"
                >
                  <Pause className="h-4 w-4" /> Pause Timer
                </button>
                <Link
                  href={`/projects/${activeWorkSession.projectId}/content/${activeWorkSession.contentItemId}`}
                  className="flex-1 text-center rounded-xl bg-[#1d1d1f] hover:bg-[#2d2d2f] text-white py-2.5 text-[13px] font-semibold transition shadow-sm flex items-center justify-center gap-1.5"
                >
                  Open Workspace <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="text-[12px] text-[#86868b] text-center py-2 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                Task work sessions are independent from daily attendance presence.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cross-Project Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Assigned To Me</div>
          <div className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">{myAssignedItems.length}</div>
          <div className="text-[12px] text-[#86868b]">Deliverables under your ownership</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Awaiting My Review</div>
          <div className="text-[32px] font-bold text-[#9a6700] tracking-tight">{itemsNeedingReview.length}</div>
          <div className="text-[12px] text-[#86868b]">Pending your component decisions</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Open Change Requests</div>
          <div className="text-[32px] font-bold text-[#d70015] tracking-tight">{openChangeRequests.length}</div>
          <div className="text-[12px] text-[#86868b]">Requires Designer response</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Due Soon / Overdue</div>
          <div className="text-[32px] font-bold text-[#0071e3] tracking-tight">{urgentItems.length}</div>
          <div className="text-[12px] text-[#86868b]">Deadlines within 48 hours</div>
        </div>
      </div>

      {/* 2-Column Work Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approvals Requiring Action (Founder / Consultant) */}
        {canApprove && (
          <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
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
        <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
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
                    <p className="text-[13px] text-[#6e6e73] line-clamp-1 italic">&quot;{cr.requestedChange}&quot;</p>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Assigned Deliverables */}
        <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
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
        <div className="rounded-2xl border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
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
