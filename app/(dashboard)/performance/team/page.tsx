"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getAuthoritativeTeamCapacityAction } from "@/lib/actions/performance";
import { PeriodFilter, EmployeePeriodScorecard } from "@/lib/calculations/operationalEngine";
import { Users, Filter, ChevronRight, Briefcase, Clock, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

const PERIODS: { id: PeriodFilter; label: string }[] = [
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
];

export default function TeamCapacityPerformancePage() {
  const [period, setPeriod] = useState<PeriodFilter>("this_week");
  const [loading, setLoading] = useState(true);
  const [scorecards, setScorecards] = useState<EmployeePeriodScorecard[]>([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadTeamCapacity();
  }, [period]);

  const loadTeamCapacity = async () => {
    setLoading(true);
    const res = await getAuthoritativeTeamCapacityAction(period);
    if (res.success) {
      setScorecards(res.scorecards);
    }
    setLoading(false);
  };

  const filteredScorecards = scorecards.filter((card) => {
    const matchesRole = roleFilter === "all" || card.user.role === roleFilter;
    const matchesSearch =
      card.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.capacity.primaryFunction.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Navigation Breadcrumb & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#86868b]">
            <Link href="/performance" className="hover:text-[#0071e3] transition">
              Performance
            </Link>
            <span>/</span>
            <span className="text-[#1d1d1f] font-semibold">Team Capacity</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] mt-1">
            Team Capacity & Allocation
          </h1>
          <p className="text-sm text-[#86868b] mt-1">
            Individual weekly schedules, date-aware capacity adjustments, planned allocation vs logged actual utilization.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-1.5 bg-[#f5f5f7] p-1 rounded-full border border-black/[0.06] self-start md:self-auto">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition ${
                period === p.id
                  ? "bg-white text-[#1d1d1f] shadow-sm font-semibold"
                  : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] pb-2 overflow-x-auto scrollbar-none">
        <Link
          href="/performance"
          className="px-4 py-1.5 rounded-full text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
        >
          Overview
        </Link>
        <Link
          href="/performance/team"
          className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1d1d1f] text-white transition"
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

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-medium text-[#1d1d1f]"
          >
            <option value="all">All Roles</option>
            <option value="designer">Designers</option>
            <option value="consultant">Consultants / Account Managers</option>
            <option value="founder">Founders</option>
            <option value="admin">Admins</option>
          </select>
        </div>

        <input
          type="text"
          placeholder="Search team member..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-64 px-3.5 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
        />
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4 text-center">Function</th>
                <th className="py-3 px-4 text-right">Final Capacity</th>
                <th className="py-3 px-4 text-right">Assigned</th>
                <th className="py-3 px-4 text-right">Remaining</th>
                <th className="py-3 px-4 text-right">Actual</th>
                <th className="py-3 px-4 text-right">Allocation %</th>
                <th className="py-3 px-4 text-right">Utilization %</th>
                <th className="py-3 px-4 text-center">Capacity Status</th>
                <th className="py-3 px-4 text-right">Efficiency %</th>
                <th className="py-3 px-4 text-right">On-Time %</th>
                <th className="py-3 px-4 text-right">Completed</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-[#86868b]">Loading team capacity comparisons...</td>
                </tr>
              ) : filteredScorecards.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-[#86868b]">No employees match the filter.</td>
                </tr>
              ) : (
                filteredScorecards.map((card) => {
                  const isOverloaded = card.allocationPercent > 105;
                  return (
                    <tr key={card.user.id} className="hover:bg-[#fbfbfd] transition">
                      <td className="py-3.5 px-4 font-semibold text-[#1d1d1f]">
                        <Link href={`/performance/${card.user.id}`} className="hover:text-[#0071e3]">
                          {card.user.name}
                        </Link>
                        <div className="text-[11px] text-[#86868b] font-normal capitalize">{card.user.role}</div>
                      </td>

                      <td className="py-3.5 px-4 text-center text-xs text-[#6e6e73]">
                        {card.capacity.primaryFunction}
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

                      {/* Capacity Status */}
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

                      {/* Efficiency */}
                      <td className="py-3.5 px-4 text-right font-semibold text-[#1d1d1f]">
                        {card.efficiencyPercent !== null ? `${card.efficiencyPercent}%` : "—"}
                      </td>

                      {/* On-Time */}
                      <td className="py-3.5 px-4 text-right font-semibold text-[#1d1d1f]">
                        {card.onTimePercent !== null ? `${card.onTimePercent}%` : "—"}
                      </td>

                      {/* Completed Tasks */}
                      <td className="py-3.5 px-4 text-right font-bold text-[#34c759]">
                        {card.completedTasksCount}
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
    </div>
  );
}
