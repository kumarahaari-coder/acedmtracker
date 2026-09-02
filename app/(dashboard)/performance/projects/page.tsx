"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getAuthoritativeProjectsPerformanceAction } from "@/lib/actions/performance";
import { PeriodFilter, ProjectPerformanceScorecard } from "@/lib/calculations/operationalEngine";
import { Folder, ChevronRight, CheckCircle2, Clock, AlertTriangle, TrendingUp, DollarSign } from "lucide-react";

const PERIODS: { id: PeriodFilter; label: string }[] = [
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
];

export default function ProjectsPerformancePage() {
  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectPerformanceScorecard[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadProjectsData();
  }, [period]);

  const loadProjectsData = async () => {
    setLoading(true);
    const res = await getAuthoritativeProjectsPerformanceAction(period);
    if (res.success) {
      setProjects(res.projectScorecards);
    }
    setLoading(false);
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.project.clientBrand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#86868b]">
            <Link href="/performance" className="hover:text-[#0071e3] transition">
              Performance
            </Link>
            <span>/</span>
            <span className="text-[#1d1d1f] font-semibold">Projects</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] mt-1">
            Projects Operational Performance
          </h1>
          <p className="text-sm text-[#86868b] mt-1">
            Planned vs actual effort, contractual monthly commitments fulfillment, and performance advertising metrics.
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
          className="px-4 py-1.5 rounded-full text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
        >
          Team Capacity
        </Link>
        <Link
          href="/performance/projects"
          className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1d1d1f] text-white transition"
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

      {/* Search Bar */}
      <div className="flex justify-end">
        <input
          type="text"
          placeholder="Search project or brand..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-72 px-3.5 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
        />
      </div>

      {/* Projects Grid / List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-sm text-[#86868b] bg-white rounded-2xl border border-black/[0.08]">
            Loading projects operational performance...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#86868b] bg-white rounded-2xl border border-black/[0.08]">
            No projects found.
          </div>
        ) : (
          filteredProjects.map((p) => (
            <div
              key={p.project.id}
              className="bg-white rounded-2xl border border-black/[0.08] p-6 shadow-sm space-y-4 hover:border-black/[0.15] transition"
            >
              {/* Project Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/projects/${p.project.id}`}
                      className="text-lg font-bold text-[#1d1d1f] hover:text-[#0071e3] transition"
                    >
                      {p.project.name}
                    </Link>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f5f5f7] text-[#86868b]">
                      {p.project.status}
                    </span>
                  </div>
                  <div className="text-xs text-[#86868b] mt-0.5">{p.project.clientBrand}</div>
                </div>

                <div className="flex items-center gap-4 text-xs font-medium">
                  <div>
                    <span className="text-[#86868b]">Completion: </span>
                    <span className="font-bold text-[#0071e3] text-sm">{p.completionPercent}%</span>
                  </div>
                  <Link
                    href={`/projects/${p.project.id}/commitments`}
                    className="px-3 py-1 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-lg transition"
                  >
                    Manage Commitments
                  </Link>
                </div>
              </div>

              {/* Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="p-3 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  <div className="text-[#86868b]">Planned Tasks</div>
                  <div className="text-base font-bold text-[#1d1d1f] mt-1">{p.plannedTasksCount}</div>
                </div>

                <div className="p-3 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  <div className="text-[#86868b]">Completed</div>
                  <div className="text-base font-bold text-[#34c759] mt-1">{p.completedTasksCount}</div>
                </div>

                <div className="p-3 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  <div className="text-[#86868b]">Planned Effort</div>
                  <div className="text-base font-bold text-[#0071e3] mt-1">{p.plannedHours}h</div>
                </div>

                <div className="p-3 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  <div className="text-[#86868b]">Actual Logged</div>
                  <div className="text-base font-bold text-[#1d1d1f] mt-1">{p.actualHours}h</div>
                </div>

                <div className="p-3 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  <div className="text-[#86868b]">Variance</div>
                  <div className="text-base font-bold text-[#1d1d1f] mt-1">
                    {p.varianceHours >= 0 ? `+${p.varianceHours}h` : `${p.varianceHours}h`}
                  </div>
                </div>

                <div className="p-3 bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  <div className="text-[#86868b]">Ad-Hoc Effort</div>
                  <div className="text-base font-bold text-[#ff9500] mt-1">{p.adHocHours}h</div>
                </div>
              </div>

              {/* Commitments & Advertising Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Contractual Commitments */}
                <div className="p-4 bg-[#fbfbfd] rounded-xl border border-black/[0.04] space-y-2">
                  <div className="text-xs font-bold text-[#1d1d1f]">Monthly Contractual Commitments</div>
                  {p.commitments.length === 0 ? (
                    <div className="text-xs text-[#86868b] py-2">No contractual deliverable quotas set for this month.</div>
                  ) : (
                    <div className="space-y-2">
                      {p.commitments.map((c) => (
                        <div key={c.workTypeName} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-[#1d1d1f]">{c.workTypeName}</span>
                            <span className="text-[#86868b]">
                              <span className="font-bold text-[#1d1d1f]">{c.fulfilledContractedQuantity}</span> / {c.committedQuantity} ({c.percent}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#0071e3] rounded-full transition-all"
                              style={{ width: `${Math.min(100, c.percent)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Advertising Inputs / Performance */}
                <div className="p-4 bg-[#fbfbfd] rounded-xl border border-black/[0.04] space-y-2">
                  <div className="text-xs font-bold text-[#1d1d1f]">Performance / Advertising Results</div>
                  {p.advertising ? (
                    <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                      <div>
                        <div className="text-[#86868b]">Spend</div>
                        <div className="font-bold text-[#1d1d1f] mt-0.5">
                          {p.advertising.adSpend > 0 ? `${p.advertising.adSpend}` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#86868b]">Leads</div>
                        <div className="font-bold text-[#1d1d1f] mt-0.5">{p.advertising.leads}</div>
                      </div>
                      <div>
                        <div className="text-[#86868b]">CPL</div>
                        <div className="font-bold text-[#0071e3] mt-0.5">
                          {p.advertising.cpl !== null ? `${p.advertising.cpl}` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#86868b]">Conversions</div>
                        <div className="font-bold text-[#1d1d1f] mt-0.5">{p.advertising.conversions}</div>
                      </div>
                      <div>
                        <div className="text-[#86868b]">Conv. Rate</div>
                        <div className="font-bold text-[#34c759] mt-0.5">
                          {p.advertising.conversionRate !== null ? `${p.advertising.conversionRate}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#86868b]">Cost / Conv</div>
                        <div className="font-bold text-[#1d1d1f] mt-0.5">
                          {p.advertising.costPerConversion !== null ? `${p.advertising.costPerConversion}` : "—"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-[#86868b] py-2">
                      Creative / Retainer project (No advertising metrics configured).
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
