"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useRole } from "@/lib/context/RoleContext";
import { getAuthoritativePerformanceOverviewAction } from "@/lib/actions/performance";
import {
  PeriodFilter,
  TeamPerformanceOverviewDTO,
  ProjectPerformanceScorecard,
} from "@/lib/calculations/operationalEngine";
import { KpiDrilldownModal, DrilldownType } from "@/components/performance/KpiDrilldownModal";
import {
  Users,
  Briefcase,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ChevronRight,
  Filter,
  ArrowUpRight,
} from "lucide-react";

const PERIODS: { id: PeriodFilter; label: string }[] = [
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
];

function PerformanceOverviewContent() {
  const { activeRole } = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read authoritative filter params from URL
  const periodParam = (searchParams.get("period") as PeriodFilter) || "this_month";
  const roleParam = searchParams.get("role") || "all";
  const projectParam = searchParams.get("project") || "all";

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<TeamPerformanceOverviewDTO | null>(null);
  const [projectScorecards, setProjectScorecards] = useState<ProjectPerformanceScorecard[]>([]);
  const [availableProjects, setAvailableProjects] = useState<{ id: string; name: string; clientBrand: string }[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);

  // Drilldown Modal State
  const [drilldownModal, setDrilldownModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    type: DrilldownType;
    items?: any[];
    workSessions?: any[];
    changeRequests?: any[];
  }>({
    isOpen: false,
    title: "",
    type: "actual_hours",
  });

  useEffect(() => {
    loadPerformanceData();
  }, [periodParam, roleParam, projectParam]);

  const loadPerformanceData = async () => {
    setLoading(true);
    const res = await getAuthoritativePerformanceOverviewAction({
      period: periodParam,
      role: roleParam !== "all" ? roleParam : undefined,
      projectId: projectParam !== "all" ? projectParam : undefined,
    });
    if (res.success && res.overview) {
      setOverview(res.overview);
      setProjectScorecards(res.projectScorecards || []);
      if (res.availableProjects) setAvailableProjects(res.availableProjects);
      if (res.availableRoles) setAvailableRoles(res.availableRoles);
    }
    setLoading(false);
  };

  const updateFilters = (updates: { period?: string; role?: string; project?: string }) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (updates.period !== undefined) {
      if (updates.period === "this_month") params.delete("period");
      else params.set("period", updates.period);
    }
    if (updates.role !== undefined) {
      if (updates.role === "all") params.delete("role");
      else params.set("role", updates.role);
    }
    if (updates.project !== undefined) {
      if (updates.project === "all") params.delete("project");
      else params.set("project", updates.project);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const handleResetFilters = () => {
    router.push(pathname, { scroll: false });
  };

  const isFiltered = periodParam !== "this_month" || roleParam !== "all" || projectParam !== "all";

  const openDrilldown = (type: DrilldownType, title: string, subtitle?: string) => {
    if (!overview) return;
    const allItems = overview.employeeScorecards.flatMap((e) => e.assignedTasks);
    const allSessions = overview.employeeScorecards.flatMap((e) => e.workSessions);
    const allCompleted = overview.employeeScorecards.flatMap((e) => e.completedTasks);

    setDrilldownModal({
      isOpen: true,
      title,
      subtitle,
      type,
      items: type === "completed_tasks" ? allCompleted : allItems,
      workSessions: allSessions,
      changeRequests: [],
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#0071e3] uppercase tracking-wider">Company Operational Engine</span>
            <span className="text-[12px] text-[#86868b]">• Authoritative PostgreSQL Calculations</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] mt-1">
            Performance & Capacity
          </h1>
          <p className="text-sm text-[#86868b] mt-1">
            Live team capacity, work allocation, timer actuals, delivery on-time rates, and project health.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] pb-2 overflow-x-auto scrollbar-none">
        <Link
          href="/performance"
          className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1d1d1f] text-white transition"
        >
          Overview
        </Link>
        <Link
          href="/performance/team"
          className="px-4 py-1.5 rounded-full text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
        >
          Team Capacity
        </Link>
        <Link
          href="/performance/projects"
          className="px-4 py-1.5 rounded-full text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
        >
          Projects
        </Link>
        <Link
          href="/performance/effort"
          className="px-4 py-1.5 rounded-full text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
        >
          Effort Analysis
        </Link>
      </div>

      {/* Authoritative Filter Toolbar: Period | Role | Project */}
      <div className="bg-[#fbfbfd] p-4 rounded-2xl border border-black/[0.08] shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector Pills */}
          <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-full border border-black/[0.06]">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => updateFilters({ period: p.id })}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  periodParam === p.id
                    ? "bg-white text-[#1d1d1f] shadow-sm font-semibold"
                    : "text-[#6e6e73] hover:text-[#1d1d1f]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 bg-white px-3.5 py-1.5 rounded-full border border-black/[0.08] shadow-sm text-xs">
            <span className="text-[#86868b] font-medium">Role:</span>
            <select
              value={roleParam}
              onChange={(e) => updateFilters({ role: e.target.value })}
              className="bg-transparent font-semibold text-[#1d1d1f] focus:outline-none capitalize cursor-pointer"
            >
              <option value="all">All Roles</option>
              {availableRoles.map((r) => (
                <option key={r} value={r.toLowerCase()}>
                  {r.charAt(0).toUpperCase() + r.slice(1).replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-1.5 bg-white px-3.5 py-1.5 rounded-full border border-black/[0.08] shadow-sm text-xs">
            <span className="text-[#86868b] font-medium">Project:</span>
            <select
              value={projectParam}
              onChange={(e) => updateFilters({ project: e.target.value })}
              className="bg-transparent font-semibold text-[#1d1d1f] focus:outline-none cursor-pointer max-w-[220px] truncate"
            >
              <option value="all">All Projects</option>
              {availableProjects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} {proj.clientBrand ? `(${proj.clientBrand})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Reset Filters Action */}
        {isFiltered && (
          <button
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#6e6e73] hover:text-[#1d1d1f] bg-white border border-black/[0.08] shadow-sm hover:bg-[#f5f5f7] transition self-start md:self-auto cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#86868b]" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      {/* Empty State Banner when Filter Intersection Produces No Records */}
      {!loading && overview?.employeeScorecards.length === 0 && (
        <div className="p-8 text-center bg-white rounded-2xl border border-black/[0.08] shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-full bg-[#f5f5f7] flex items-center justify-center mx-auto text-[#86868b]">
            <Filter className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-[#1d1d1f]">No performance data for the selected filters</h3>
          <p className="text-xs text-[#86868b] max-w-md mx-auto">
            There are no tracked records or assigned members matching the selected period, role, and project combination.
          </p>
          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1d1d1f] hover:bg-black text-white rounded-full text-xs font-semibold transition mt-2 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      )}

      {/* Top Authoritative KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {/* Team Capacity */}
        <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
            <span>Team Capacity</span>
            <Users className="h-4 w-4 text-[#86868b]" />
          </div>
          <div className="text-2xl font-bold text-[#1d1d1f] mt-2">
            {loading ? "..." : `${overview?.teamCapacityHours || 0}h`}
          </div>
          <div className="text-[11px] text-[#86868b] mt-1">Configured period capacity</div>
        </div>

        {/* Assigned Hours (Allocation) */}
        <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
            <span>Assigned Effort</span>
            <Briefcase className="h-4 w-4 text-[#0071e3]" />
          </div>
          <div className="text-2xl font-bold text-[#0071e3] mt-2">
            {loading ? "..." : `${overview?.teamAssignedHours || 0}h`}
          </div>
          <div className="text-[11px] font-medium text-[#1d1d1f] mt-1">
            Allocation: <span className="font-bold">{overview?.teamAllocationPercent || 0}%</span>
          </div>
        </div>

        {/* Actual Hours (Clickable Drilldown) */}
        <button
          onClick={() => openDrilldown("actual_hours", "Actual Tracked Hours Breakdown", "WorkSessions logged during this period")}
          className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm text-left hover:border-[#0071e3]/40 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
            <span>Actual Tracked</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[#86868b] group-hover:text-[#0071e3] transition" />
          </div>
          <div className="text-2xl font-bold text-[#1d1d1f] mt-2">
            {loading ? "..." : `${overview?.teamActualHours || 0}h`}
          </div>
          <div className="text-[11px] font-medium text-[#1d1d1f] mt-1">
            Utilization: <span className="font-bold">{overview?.teamUtilizationPercent || 0}%</span>
          </div>
        </button>

        {/* Completed Tasks (Clickable Drilldown) */}
        <button
          onClick={() => openDrilldown("completed_tasks", "Completed Deliverables", "Tasks marked completed or published in this period")}
          className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm text-left hover:border-[#0071e3]/40 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
            <span>Completed Tasks</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[#86868b] group-hover:text-[#0071e3] transition" />
          </div>
          <div className="text-2xl font-bold text-[#34c759] mt-2">
            {loading ? "..." : overview?.completedTasksCount || 0}
          </div>
          <div className="text-[11px] text-[#86868b] mt-1">
            On-Time: <span className="font-bold text-[#1d1d1f]">
              {typeof overview?.onTimePercent === "number"
                ? `${overview.onTimePercent}%`
                : typeof (overview as any)?.onTimePercentage === "number"
                ? `${(overview as any).onTimePercentage}%`
                : "N/A"}
            </span>
          </div>
        </button>

        {/* Ad-Hoc / Unplanned Hours (Clickable Drilldown) */}
        <button
          onClick={() => openDrilldown("adhoc_hours", "Ad-Hoc / Unplanned Deliverables", "Deliverables flagged as ad-hoc")}
          className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm text-left hover:border-[#0071e3]/40 transition group cursor-pointer col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between text-xs text-[#86868b] font-medium">
            <span>Ad-Hoc Hours</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[#86868b] group-hover:text-[#0071e3] transition" />
          </div>
          <div className="text-2xl font-bold text-[#ff9500] mt-2">
            {loading ? "..." : `${overview?.adHocHours || 0}h`}
          </div>
          <div className="text-[11px] text-[#86868b] mt-1">Unplanned client requests</div>
        </button>
      </div>

      {/* Team Capacity & Workload Table */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden space-y-1">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#1d1d1f]">Team Capacity & Workload</h3>
            <p className="text-xs text-[#86868b] mt-0.5">Authoritative capacity vs assigned planned effort and logged timers.</p>
          </div>
          <Link
            href="/performance/team"
            className="text-xs font-semibold text-[#0071e3] hover:underline flex items-center gap-1"
          >
            <span>Full Team View</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                <th className="py-3 px-4">Team Member</th>
                <th className="py-3 px-4 text-center">Eligibility</th>
                <th className="py-3 px-4 text-right">Capacity</th>
                <th className="py-3 px-4 text-right">Assigned</th>
                <th className="py-3 px-4 text-right">Remaining</th>
                <th className="py-3 px-4 text-right">Actual</th>
                <th className="py-3 px-4 text-right">Allocation %</th>
                <th className="py-3 px-4 text-right">Utilization %</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#86868b]">Loading team capacity...</td>
                </tr>
              ) : overview?.employeeScorecards.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#86868b]">No performance data for the selected filters.</td>
                </tr>
              ) : (
                overview?.employeeScorecards.map((card) => {
                  const isOverloaded = card.allocationPercent > 105;
                  return (
                    <tr key={card.user.id} className="hover:bg-[#fbfbfd] transition">
                      <td className="py-3.5 px-4 font-medium text-[#1d1d1f]">
                        <div className="font-semibold">{card.user.name}</div>
                        <div className="text-[11px] text-[#86868b] capitalize">{card.user.role} • {card.capacity.primaryFunction}</div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          card.capacity.creativeEligibility === "primary"
                            ? "bg-[#0071e3]/10 text-[#0071e3]"
                            : card.capacity.creativeEligibility === "backup"
                            ? "bg-[#ff9500]/10 text-[#c97800]"
                            : "bg-black/[0.05] text-[#86868b]"
                        }`}>
                          {card.capacity.creativeEligibility}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium">{card.capacity.finalCapacityHours}h</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-[#0071e3]">{card.assignedPlannedHours}h</td>
                      
                      {/* Unclamped Remaining Capacity */}
                      <td className={`py-3.5 px-4 text-right font-semibold ${isOverloaded ? "text-[#ff3b30]" : "text-[#1d1d1f]"}`}>
                        {card.remainingPlannedHours}h
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium">{card.actualLoggedHours}h</td>
                      
                      {/* Allocation % */}
                      <td className={`py-3.5 px-4 text-right font-bold ${isOverloaded ? "text-[#ff3b30]" : "text-[#1d1d1f]"}`}>
                        {card.allocationPercent}%
                      </td>

                      {/* Utilization % */}
                      <td className="py-3.5 px-4 text-right font-medium text-[#6e6e73]">
                        {card.utilizationPercent}%
                      </td>

                      {/* Capacity Status Pill */}
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

                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/performance/${card.user.id}`}
                          className="px-2.5 py-1 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-lg text-xs font-medium transition"
                        >
                          Drilldown
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Project Operational Health & Commitments */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden space-y-1">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#1d1d1f]">Monthly Project Health & Commitments</h3>
            <p className="text-xs text-[#86868b] mt-0.5">Planned vs actual effort and contractual deliverable fulfillment.</p>
          </div>
          <Link
            href="/performance/projects"
            className="text-xs font-semibold text-[#0071e3] hover:underline flex items-center gap-1"
          >
            <span>All Projects</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4 text-right">Planned Tasks</th>
                <th className="py-3 px-4 text-right">Completed</th>
                <th className="py-3 px-4 text-right">Planned Hrs</th>
                <th className="py-3 px-4 text-right">Actual Hrs</th>
                <th className="py-3 px-4 text-right">Ad-Hoc Hrs</th>
                <th className="py-3 px-4">Contractual Commitments</th>
                <th className="py-3 px-4 text-right">Completion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#86868b]">Loading project health...</td>
                </tr>
              ) : projectScorecards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#86868b]">No performance data for the selected filters.</td>
                </tr>
              ) : (
                projectScorecards.map((proj) => (
                  <tr key={proj.project.id} className="hover:bg-[#fbfbfd] transition">
                    <td className="py-3.5 px-4 font-semibold text-[#1d1d1f]">
                      <Link href={`/projects/${proj.project.id}`} className="hover:text-[#0071e3]">
                        {proj.project.name}
                      </Link>
                      <div className="text-[11px] text-[#86868b] font-normal">{proj.project.clientBrand}</div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-medium">{proj.plannedTasksCount}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#34c759]">{proj.completedTasksCount}</td>
                    <td className="py-3.5 px-4 text-right font-medium">{proj.plannedHours}h</td>
                    <td className="py-3.5 px-4 text-right font-medium">{proj.actualHours}h</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-[#ff9500]">{proj.adHocHours}h</td>

                    {/* Commitments Progress */}
                    <td className="py-3.5 px-4">
                      {proj.commitments.length === 0 ? (
                        <span className="text-xs text-[#86868b]">No monthly targets</span>
                      ) : (
                        <div className="space-y-1">
                          {proj.commitments.map((c) => (
                            <div key={c.workTypeName} className="text-xs flex items-center justify-between gap-3">
                              <span className="text-[#6e6e73] truncate max-w-[140px]">{c.workTypeName}:</span>
                              <span className="font-semibold text-[#1d1d1f]">
                                {c.fulfilledContractedQuantity} / {c.committedQuantity} ({c.percent}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-bold text-[#0071e3]">
                      {proj.completionPercent}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drilldown Modal Component */}
      <KpiDrilldownModal
        isOpen={drilldownModal.isOpen}
        onClose={() => setDrilldownModal((prev) => ({ ...prev, isOpen: false }))}
        title={drilldownModal.title}
        subtitle={drilldownModal.subtitle}
        type={drilldownModal.type}
        items={drilldownModal.items}
        workSessions={drilldownModal.workSessions}
        changeRequests={drilldownModal.changeRequests}
      />
    </div>
  );
}

export default function PerformanceOverviewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#86868b]">Loading performance overview...</div>}>
      <PerformanceOverviewContent />
    </Suspense>
  );
}
