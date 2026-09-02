"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getAuthoritativeEffortAnalysisAction } from "@/lib/actions/performance";
import { PeriodFilter, EffortAnalysisRow } from "@/lib/calculations/operationalEngine";
import { Sliders, Search, Filter, Clock, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

const PERIODS: { id: PeriodFilter; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
];

const CATEGORIES = ["All", "Static", "Carousel", "Video", "Content", "Operations", "Advertising", "Web/UI", "Non-Creative"];

export default function EffortAnalysisPerformancePage() {
  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EffortAnalysisRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadEffortAnalysis();
  }, [period]);

  const loadEffortAnalysis = async () => {
    setLoading(true);
    const res = await getAuthoritativeEffortAnalysisAction(period);
    if (res.success) {
      setRows(res.analysisRows);
    }
    setLoading(false);
  };

  const filteredRows = rows.filter((r) => {
    const matchesCat = selectedCategory === "All" || r.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      r.workType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

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
            <span className="text-[#1d1d1f] font-semibold">Effort Analysis</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] mt-1">
            Effort Standards vs Actuals Analysis
          </h1>
          <p className="text-sm text-[#86868b] mt-1">
            Compare Ace Assured's standard effort assumptions against completed actual production time.
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
          className="px-4 py-1.5 rounded-full text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
        >
          Projects
        </Link>
        <Link
          href="/performance/effort"
          className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1d1d1f] text-white transition"
        >
          Effort Analysis
        </Link>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-[#f5f5f7] text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search deliverable..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:w-64 px-3.5 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
        />
      </div>

      {/* Effort Analysis Table */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                <th className="py-3 px-4">Work Type & Category</th>
                <th className="py-3 px-4 text-right">Standard Base Effort</th>
                <th className="py-3 px-4 text-right">Average Actual Time</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-4 text-center">Completed Sample Size</th>
                <th className="py-3 px-4 text-center">Standard Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#86868b]">
                    Calculating effort standard variance...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#86868b]">
                    No deliverables match the filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const hasData = r.completedTasksCount > 0 && r.averageActualHours !== null;
                  const isUnderStandard = (r.varianceHours || 0) >= 0;

                  return (
                    <tr key={r.workType} className="hover:bg-[#fbfbfd] transition">
                      <td className="py-3.5 px-4 font-semibold text-[#1d1d1f]">
                        <div>{r.workType}</div>
                        <div className="text-[11px] text-[#86868b] font-normal">{r.category}</div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-[#0071e3]">
                        {r.standardBaseHours.toFixed(2)}h
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-[#1d1d1f]">
                        {hasData ? `${r.averageActualHours!.toFixed(2)}h` : "—"}
                      </td>

                      {/* Variance */}
                      <td className={`py-3.5 px-4 text-right font-semibold ${
                        !hasData ? "text-[#86868b]" : isUnderStandard ? "text-[#34c759]" : "text-[#ff3b30]"
                      }`}>
                        {hasData
                          ? `${r.varianceHours! >= 0 ? "+" : ""}${r.varianceHours!.toFixed(2)}h (${
                              isUnderStandard ? "Faster" : "Over Standard"
                            })`
                          : "—"}
                      </td>

                      <td className="py-3.5 px-4 text-center font-medium text-xs text-[#6e6e73]">
                        {r.completedTasksCount} tasks
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {!hasData ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/[0.04] text-[#86868b]">
                            No Data
                          </span>
                        ) : Math.abs(r.varianceHours || 0) <= 0.5 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#34c759]/10 text-[#248a3d]">
                            Accurate Standard
                          </span>
                        ) : isUnderStandard ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0071e3]/10 text-[#0071e3]">
                            Conservative
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ff3b30]/10 text-[#d70015]">
                            Underestimated
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
