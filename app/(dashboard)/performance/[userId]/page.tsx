"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAuthoritativeEmployeePerformanceAction } from "@/lib/actions/performance";
import { PeriodFilter, EmployeePeriodScorecard } from "@/lib/calculations/operationalEngine";
import {
  ArrowLeft,
  User,
  Clock,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  TrendingUp,
  Calendar,
} from "lucide-react";

const PERIODS: { id: PeriodFilter; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
];

export default function EmployeePerformanceDetailPage() {
  const params = useParams();
  const userId = params?.userId as string;

  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<EmployeePeriodScorecard | null>(null);

  useEffect(() => {
    if (userId) {
      loadEmployeePerformance();
    }
  }, [userId, period]);

  const loadEmployeePerformance = async () => {
    setLoading(true);
    const res = await getAuthoritativeEmployeePerformanceAction(userId, period);
    if (res.success && res.scorecard) {
      setScorecard(res.scorecard);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center text-sm text-[#86868b]">
        Loading employee scorecard...
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center space-y-4">
        <h2 className="text-lg font-bold text-[#1d1d1f]">Employee Scorecard Not Found</h2>
        <Link href="/performance/team" className="text-xs font-semibold text-[#0071e3] hover:underline">
          Return to Team Capacity
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb & Profile Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#86868b]">
            <Link href="/performance" className="hover:text-[#0071e3] transition">
              Performance
            </Link>
            <span>/</span>
            <Link href="/performance/team" className="hover:text-[#0071e3] transition">
              Team
            </Link>
            <span>/</span>
            <span className="text-[#1d1d1f] font-semibold">{scorecard.user.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="h-10 w-10 rounded-full bg-[#0071e3] text-white flex items-center justify-center font-bold text-sm">
              {scorecard.user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">
                {scorecard.user.name}
              </h1>
              <p className="text-xs text-[#86868b] capitalize">
                {scorecard.user.role} • {scorecard.capacity.primaryFunction} • Status: {scorecard.capacityStatus}
              </p>
            </div>
          </div>
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

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
          <div className="text-xs text-[#86868b]">Period Capacity</div>
          <div className="text-2xl font-bold text-[#1d1d1f] mt-1">{scorecard.capacity.finalCapacityHours}h</div>
          <div className="text-[11px] text-[#86868b] mt-0.5">
            Base: {scorecard.capacity.baseCapacityHours}h | Adj: {scorecard.capacity.adjustmentHours}h
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
          <div className="text-xs text-[#86868b]">Assigned Effort (Allocation)</div>
          <div className="text-2xl font-bold text-[#0071e3] mt-1">{scorecard.assignedPlannedHours}h</div>
          <div className="text-[11px] text-[#1d1d1f] font-medium mt-0.5">
            Allocation: <span className="font-bold">{scorecard.allocationPercent}%</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
          <div className="text-xs text-[#86868b]">Actual Logged (Utilization)</div>
          <div className="text-2xl font-bold text-[#1d1d1f] mt-1">{scorecard.actualLoggedHours}h</div>
          <div className="text-[11px] text-[#1d1d1f] font-medium mt-0.5">
            Utilization: <span className="font-bold">{scorecard.utilizationPercent}%</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-black/[0.08] shadow-sm">
          <div className="text-xs text-[#86868b]">Delivery & Efficiency</div>
          <div className="text-2xl font-bold text-[#34c759] mt-1">
            {scorecard.onTimePercent !== null ? `${scorecard.onTimePercent}%` : "—"}
          </div>
          <div className="text-[11px] text-[#86868b] mt-0.5">
            On-Time | Efficiency: {scorecard.efficiencyPercent !== null ? `${scorecard.efficiencyPercent}%` : "—"}
          </div>
        </div>
      </div>

      {/* Supporting Tasks Table */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden space-y-1">
        <div className="p-5 border-b border-black/[0.06]">
          <h3 className="text-base font-bold text-[#1d1d1f]">Assigned Period Tasks</h3>
          <p className="text-xs text-[#86868b] mt-0.5">All tasks assigned to {scorecard.user.name} during this period.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                <th className="py-3 px-4">Task & Work Type</th>
                <th className="py-3 px-4">Internal Deadline</th>
                <th className="py-3 px-4 text-right">Planned Effort</th>
                <th className="py-3 px-4 text-center">Priority</th>
                <th className="py-3 px-4 text-center">Stage</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {scorecard.assignedTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#86868b]">
                    No tasks assigned in this period.
                  </td>
                </tr>
              ) : (
                scorecard.assignedTasks.map((t) => {
                  const isCompleted = !!(t.completedAt || t.stage === "published" || t.stage === "approved");
                  return (
                    <tr key={t.id} className="hover:bg-[#fbfbfd] transition">
                      <td className="py-3.5 px-4 font-semibold text-[#1d1d1f]">
                        <div>{t.title}</div>
                        <div className="text-[11px] text-[#86868b] font-normal">{t.workType || t.contentType} • {t.platform}</div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-[#6e6e73]">
                        {t.finalInternalDeadline ? new Date(t.finalInternalDeadline).toLocaleDateString() : "—"}
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium">
                        {t.finalPlannedSeconds ? `${(t.finalPlannedSeconds / 3600).toFixed(2)}h` : "2.00h"}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          t.priority === "urgent" ? "bg-[#ff3b30]/10 text-[#d70015]" : "bg-[#f5f5f7] text-[#86868b]"
                        }`}>
                          {t.priority || "normal"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center text-xs capitalize text-[#1d1d1f]">
                        {t.stage}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {isCompleted ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#34c759]/10 text-[#248a3d]">
                            Completed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0071e3]/10 text-[#0071e3]">
                            In Progress
                          </span>
                        )}
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
