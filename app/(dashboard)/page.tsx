"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { getAuthoritativeMainDashboardAction, MainDashboardDataDTO } from "@/lib/actions/performance";
import { KpiDrilldownModal, DrilldownType } from "@/components/performance/KpiDrilldownModal";
import {
  AlertCircle,
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
  TrendingUp,
  Users,
  Folder,
  ArrowUpRight,
} from "lucide-react";

export default function AuthoritativeDashboardPage() {
  const { state, checkInAttendance, checkOutAttendance, pauseWorkSession } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<MainDashboardDataDTO | null>(null);

  // Drilldown Modal
  const [drilldownModal, setDrilldownModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    type: DrilldownType;
    items?: any[];
    workSessions?: any[];
  }>({
    isOpen: false,
    title: "",
    type: "actual_hours",
  });

  const isManagement = activeRole === "founder" || activeRole === "admin" || activeRole === "consultant";

  useEffect(() => {
    loadDashboardData();
  }, [activeUserId, activeRole]);

  const loadDashboardData = async () => {
    setLoading(true);
    const res = await getAuthoritativeMainDashboardAction();
    if (res.success && res.data) {
      setDashboardData(res.data);
    }
    setLoading(false);
  };

  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const todayAttendance = state.attendanceRecords.find(
    (r) => r.userId === activeUserId && r.attendanceDate === todayDate
  );

  const activeWorkSession = state.workSessions.find(
    (ws) => ws.userId === activeUserId && ws.status === "active"
  );
  const activeWorkItem = activeWorkSession
    ? state.contentItems.find((i) => i.id === activeWorkSession.contentItemId)
    : null;

  const openDrilldown = (type: DrilldownType, title: string, subtitle?: string) => {
    const allItems = state.contentItems;
    const allSessions = state.workSessions;
    setDrilldownModal({
      isOpen: true,
      title,
      subtitle,
      type,
      items: allItems,
      workSessions: allSessions,
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Welcome / Attendance Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#0071e3] uppercase tracking-wider">
              {isManagement ? "Operations Control Center" : "Workspace Workspace"}
            </span>
            <span className="text-[12px] text-[#86868b]">• Asia/Kolkata</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] mt-1">
            {isManagement ? "Company Operational Dashboard" : "My Work & Tasks"}
          </h1>
        </div>

        {/* Live Attendance / Clock Control */}
        <div className="flex items-center gap-3 bg-white p-2 px-3 rounded-2xl border border-black/[0.08] shadow-sm self-start md:self-auto">
          <Clock className="h-4 w-4 text-[#86868b]" />
          <div className="text-xs">
            <span className="text-[#86868b]">Status: </span>
            <span className="font-semibold text-[#1d1d1f]">
              {todayAttendance?.status === "checked_in" ? "Clocked In" : "Not Clocked In"}
            </span>
          </div>
          {todayAttendance?.status !== "checked_in" ? (
            <button
              onClick={() => checkInAttendance(activeUserId)}
              className="px-3 py-1 bg-[#34c759] hover:bg-[#2fb34f] text-white rounded-full text-xs font-semibold transition"
            >
              Check In
            </button>
          ) : (
            <button
              onClick={() => checkOutAttendance(activeUserId)}
              className="px-3 py-1 bg-[#ff3b30] hover:bg-[#e03429] text-white rounded-full text-xs font-semibold transition"
            >
              Check Out
            </button>
          )}
        </div>
      </div>

      {/* Active Timer Alert if running */}
      {activeWorkSession && (
        <div className="p-4 bg-[#0071e3]/10 border border-[#0071e3]/20 rounded-2xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <Timer className="h-5 w-5 text-[#0071e3]" />
            <div>
              <div className="text-xs font-bold text-[#0071e3] uppercase tracking-wider">Active Timer Running</div>
              <div className="text-sm font-semibold text-[#1d1d1f] mt-0.5">
                {activeWorkItem?.title || "Operational Task"}
              </div>
            </div>
          </div>
          <button
            onClick={() => pauseWorkSession(activeWorkSession.id, activeUserId)}
            className="px-4 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Pause className="h-3.5 w-3.5" />
            <span>Pause Timer</span>
          </button>
        </div>
      )}

      {/* --- MANAGEMENT VIEW --- */}
      {isManagement ? (
        <div className="space-y-8">
          {/* Top 4 Authoritative Live Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* 1. Tasks Due Today */}
            <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
              <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
                <span>Tasks Due Today</span>
                <Clock className="h-4 w-4 text-[#0071e3]" />
              </div>
              <div className="text-2xl font-bold text-[#1d1d1f] mt-2">
                {loading ? "..." : dashboardData?.tasksDueTodayCount || 0}
              </div>
              <div className="text-[11px] text-[#86868b] mt-1">Scheduled for today's deadline</div>
            </div>

            {/* 2. Overdue Open Tasks (Clickable Drilldown) */}
            <button
              onClick={() => openDrilldown("overdue_tasks", "Overdue Open Tasks", "Tasks past their authoritative internal deadline")}
              className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm text-left hover:border-[#ff3b30]/40 transition group cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
                <span>Overdue Open Tasks</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#86868b] group-hover:text-[#ff3b30] transition" />
              </div>
              <div className="text-2xl font-bold text-[#ff3b30] mt-2">
                {loading ? "..." : dashboardData?.overdueOpenTasksCount || 0}
              </div>
              <div className="text-[11px] text-[#ff3b30] font-medium mt-1">Click to view overdue tasks</div>
            </button>

            {/* 3. Ad-Hoc Hours This Month */}
            <button
              onClick={() => openDrilldown("adhoc_hours", "Ad-Hoc Deliverables", "Unplanned scope requests this month")}
              className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm text-left hover:border-[#ff9500]/40 transition group cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
                <span>Ad-Hoc Hours (Month)</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#86868b] group-hover:text-[#ff9500] transition" />
              </div>
              <div className="text-2xl font-bold text-[#ff9500] mt-2">
                {loading ? "..." : `${dashboardData?.adHocHoursThisMonth || 0}h`}
              </div>
              <div className="text-[11px] text-[#86868b] mt-1">Unplanned client requests</div>
            </button>

            {/* 4. Completed Tasks This Month */}
            <button
              onClick={() => openDrilldown("completed_tasks", "Completed Deliverables", "All tasks completed during this month")}
              className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm text-left hover:border-[#34c759]/40 transition group cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
                <span>Completed (Month)</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#86868b] group-hover:text-[#34c759] transition" />
              </div>
              <div className="text-2xl font-bold text-[#34c759] mt-2">
                {loading ? "..." : dashboardData?.completedThisMonthCount || 0}
              </div>
              <div className="text-[11px] text-[#86868b] mt-1">Deliverables completed</div>
            </button>
          </div>

          {/* Today's Workload Table */}
          <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden space-y-1">
            <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f]">Today's Operational Workload</h3>
                <p className="text-xs text-[#86868b] mt-0.5">Tasks due today across all active client projects.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                    <th className="py-3 px-4">Task & Project</th>
                    <th className="py-3 px-4">Work Type</th>
                    <th className="py-3 px-4">Internal Deadline</th>
                    <th className="py-3 px-4">Assignee</th>
                    <th className="py-3 px-4 text-right">Planned Effort</th>
                    <th className="py-3 px-4 text-center">Priority</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#86868b]">Loading today's workload...</td>
                    </tr>
                  ) : dashboardData?.todaysWorkload.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#86868b]">Zero tasks due today.</td>
                    </tr>
                  ) : (
                    dashboardData?.todaysWorkload.map((row) => (
                      <tr key={row.id} className="hover:bg-[#fbfbfd] transition">
                        <td className="py-3.5 px-4 font-semibold text-[#1d1d1f]">
                          <Link href={`/projects/${row.projectId}`} className="hover:text-[#0071e3]">
                            {row.title}
                          </Link>
                          <div className="text-[11px] text-[#86868b] font-normal">{row.projectName}</div>
                        </td>

                        <td className="py-3.5 px-4 text-xs text-[#6e6e73]">
                          {row.workType}
                        </td>

                        <td className="py-3.5 px-4 text-xs font-medium text-[#1d1d1f]">
                          {row.internalDeadline ? new Date(row.internalDeadline).toLocaleDateString() : "Today"}
                        </td>

                        <td className="py-3.5 px-4 text-xs font-medium text-[#1d1d1f]">
                          {row.assigneeName}
                        </td>

                        <td className="py-3.5 px-4 text-right font-semibold text-[#0071e3]">
                          {row.plannedHours !== null && row.plannedHours !== undefined
                            ? `${row.plannedHours.toFixed(2)}h`
                            : <span className="text-[11px] font-normal text-[#86868b] italic">Planned effort unavailable</span>}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            row.priority === "urgent" ? "bg-[#ff3b30]/10 text-[#d70015]" : "bg-[#f5f5f7] text-[#86868b]"
                          }`}>
                            {row.priority}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center capitalize text-xs font-medium">
                          {row.status}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Weekly Team Capacity Table */}
          <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden space-y-1">
            <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f]">Weekly Team Capacity (This Week)</h3>
                <p className="text-xs text-[#86868b] mt-0.5">Authoritative capacity, assigned effort, and active status.</p>
              </div>
              <Link href="/performance/team" className="text-xs font-semibold text-[#0071e3] hover:underline flex items-center gap-1">
                <span>View Full Team</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4 text-right">Capacity</th>
                    <th className="py-3 px-4 text-right">Assigned</th>
                    <th className="py-3 px-4 text-right">Remaining</th>
                    <th className="py-3 px-4 text-right">Actual</th>
                    <th className="py-3 px-4 text-right">Allocation %</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Efficiency %</th>
                    <th className="py-3 px-4 text-right">On-Time %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {dashboardData?.weeklyTeamCapacity.map((card) => {
                    const isOverloaded = card.allocationPercent > 105;
                    return (
                      <tr key={card.user.id} className="hover:bg-[#fbfbfd] transition">
                        <td className="py-3.5 px-4 font-semibold text-[#1d1d1f]">
                          <Link href={`/performance/${card.user.id}`} className="hover:text-[#0071e3]">
                            {card.user.name}
                          </Link>
                          <div className="text-[11px] text-[#86868b] font-normal capitalize">{card.user.role}</div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-medium">{card.capacity.finalCapacityHours}h</td>
                        <td className="py-3.5 px-4 text-right font-semibold text-[#0071e3]">{card.assignedPlannedHours}h</td>
                        <td className={`py-3.5 px-4 text-right font-semibold ${isOverloaded ? "text-[#ff3b30]" : "text-[#1d1d1f]"}`}>
                          {card.remainingPlannedHours}h
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium">{card.actualLoggedHours}h</td>
                        <td className={`py-3.5 px-4 text-right font-bold ${isOverloaded ? "text-[#ff3b30]" : "text-[#1d1d1f]"}`}>
                          {card.allocationPercent}%
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              card.capacityStatus === "Overloaded"
                                ? "bg-[#ff3b30]/10 text-[#d70015]"
                                : card.capacityStatus === "Fully Loaded"
                                ? "bg-[#ff9500]/10 text-[#c97800]"
                                : card.capacityStatus === "Healthy"
                                ? "bg-[#34c759]/10 text-[#248a3d]"
                                : "bg-[#0071e3]/10 text-[#0071e3]"
                            }`}
                          >
                            {card.capacityStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-[#1d1d1f]">
                          {card.efficiencyPercent !== null ? `${card.efficiencyPercent}%` : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-[#1d1d1f]">
                          {card.onTimePercent !== null ? `${card.onTimePercent}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* --- EMPLOYEE PERSONAL VIEW --- */
        <div className="space-y-6">
          {/* Attendance and Timer Distinct Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Today's Attendance Panel */}
            <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1d1d1f] flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#0071e3]" /> Today's Attendance
                </h3>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    todayAttendance?.status === "checked_in"
                      ? "bg-[#eaf6ed] text-[#1f6f32]"
                      : todayAttendance?.status === "checked_out"
                      ? "bg-[#f2f2f7] text-[#6e6e73]"
                      : "bg-[#fff8e6] text-[#9a6700]"
                  }`}
                >
                  {todayAttendance?.status === "checked_in"
                    ? "Checked In"
                    : todayAttendance?.status === "checked_out"
                    ? "Checked Out"
                    : "Not Clocked In"}
                </span>
              </div>

              <div className="text-xs text-[#6e6e73]">
                {todayAttendance?.status === "checked_in" ? (
                  <p>Checked in successfully for today. Shift in progress.</p>
                ) : todayAttendance?.status === "checked_out" ? (
                  <p>Shift Completed for Today.</p>
                ) : (
                  <p>Record your start of day attendance.</p>
                )}
              </div>

              <div className="pt-2">
                {todayAttendance?.status !== "checked_in" ? (
                  <button
                    onClick={() => checkInAttendance(activeUserId)}
                    className="px-4 py-1.5 bg-[#34c759] hover:bg-[#2fb34f] text-white rounded-full text-xs font-semibold transition"
                  >
                    Check In Now
                  </button>
                ) : (
                  <button
                    onClick={() => checkOutAttendance(activeUserId)}
                    className="px-4 py-1.5 bg-[#ff3b30] hover:bg-[#e03429] text-white rounded-full text-xs font-semibold transition"
                  >
                    Check Out for the Day
                  </button>
                )}
              </div>
            </div>

            {/* Productivity Work Timer Panel */}
            <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1d1d1f] flex items-center gap-2">
                  <Timer className="h-4 w-4 text-[#0071e3]" /> Productivity Work Timer
                </h3>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    activeWorkSession ? "bg-[#0071e3]/10 text-[#0071e3] animate-pulse" : "bg-black/[0.05] text-[#86868b]"
                  }`}
                >
                  {activeWorkSession ? "Timer Active" : "Timer Idle"}
                </span>
              </div>

              <div className="text-xs text-[#6e6e73]">
                {activeWorkSession ? (
                  <p className="font-semibold text-[#1d1d1f] truncate">
                    Tracking task: {state.contentItems.find((i) => i.id === activeWorkSession.contentItemId)?.title || activeWorkSession.contentItemId}
                  </p>
                ) : (
                  <p>No task timer running.</p>
                )}
              </div>

              <div className="text-xs text-[#86868b]">
                Logged today: <span className="font-bold text-[#1d1d1f]">{dashboardData?.employeePersonalView?.loggedHoursToday || 0}h</span>
              </div>
            </div>
          </div>

          {/* My Day Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
              <div className="text-xs text-[#86868b]">Due Today</div>
              <div className="text-2xl font-bold text-[#1d1d1f] mt-1">
                {dashboardData?.employeePersonalView?.dueTodayTasks.length || 0}
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
              <div className="text-xs text-[#86868b]">Planned Hours Today</div>
              <div className="text-2xl font-bold text-[#0071e3] mt-1">
                {dashboardData?.employeePersonalView?.plannedHoursToday || 0}h
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
              <div className="text-xs text-[#86868b]">Logged Hours Today</div>
              <div className="text-2xl font-bold text-[#1d1d1f] mt-1">
                {dashboardData?.employeePersonalView?.loggedHoursToday || 0}h
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
              <div className="text-xs text-[#86868b]">Urgent Priority</div>
              <div className="text-2xl font-bold text-[#ff3b30] mt-1">
                {dashboardData?.employeePersonalView?.urgentTasks.length || 0}
              </div>
            </div>
          </div>

          {/* My Queue (Today / Tomorrow / Upcoming) */}
          <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-[#1d1d1f]">My Task Queue</h3>

            <div className="space-y-4">
              {/* Today */}
              <div>
                <div className="text-xs font-bold text-[#0071e3] uppercase tracking-wider mb-2">Today</div>
                {dashboardData?.employeePersonalView?.queueToday.length === 0 ? (
                  <div className="p-3 bg-[#fbfbfd] rounded-xl text-xs text-[#86868b]">No tasks due today.</div>
                ) : (
                  <div className="space-y-2">
                    {dashboardData?.employeePersonalView?.queueToday.map((t) => (
                      <div key={t.id} className="p-3 bg-[#f5f5f7] rounded-xl flex items-center justify-between text-xs">
                        <div className="font-semibold text-[#1d1d1f]">{t.title}</div>
                        <span className="text-[#0071e3] font-bold">
                          {t.finalPlannedSeconds ? `${(t.finalPlannedSeconds / 3600).toFixed(2)}h` : "2h"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tomorrow */}
              <div>
                <div className="text-xs font-bold text-[#86868b] uppercase tracking-wider mb-2">Tomorrow</div>
                {dashboardData?.employeePersonalView?.queueTomorrow.length === 0 ? (
                  <div className="p-3 bg-[#fbfbfd] rounded-xl text-xs text-[#86868b]">No tasks scheduled for tomorrow.</div>
                ) : (
                  <div className="space-y-2">
                    {dashboardData?.employeePersonalView?.queueTomorrow.map((t) => (
                      <div key={t.id} className="p-3 bg-[#f5f5f7] rounded-xl flex items-center justify-between text-xs">
                        <div className="font-semibold text-[#1d1d1f]">{t.title}</div>
                        <span className="text-[#6e6e73]">
                          {t.finalPlannedSeconds ? `${(t.finalPlannedSeconds / 3600).toFixed(2)}h` : "2h"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drilldown Modal */}
      <KpiDrilldownModal
        isOpen={drilldownModal.isOpen}
        onClose={() => setDrilldownModal((prev) => ({ ...prev, isOpen: false }))}
        title={drilldownModal.title}
        subtitle={drilldownModal.subtitle}
        type={drilldownModal.type}
        items={drilldownModal.items}
        workSessions={drilldownModal.workSessions}
      />
    </div>
  );
}
