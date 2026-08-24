"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  BarChart2,
  FolderKanban,
  LineChart,
  Lock,
  PieChart,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { getClientAnalytics } from "@/lib/client-portal";

export default function ClientAnalyticsPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const [platformFilter, setPlatformFilter] = useState("all");

  const analyticsResult = getClientAnalytics(state, projectId, activeUserId, activeRole, {
    platform: platformFilter,
  });

  if (analyticsResult.status !== 200 || !analyticsResult.data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-3xl border border-black/[0.08] bg-white p-8 space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1d1d1f]">Access Restricted</h2>
          <p className="text-[14px] text-[#6e6e73]">
            {analyticsResult.error || "You do not have authorization to view analytics for this project."}
          </p>
        </div>
      </div>
    );
  }

  const { allowedMetricKeys, totals, platformBreakdown, topContent } = analyticsResult.data;

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#1d1d1f] tracking-tight">
            Campaign Performance
          </h1>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Audience engagement, organic reach, and lead performance reporting.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white border border-black/[0.08] p-1 rounded-full text-[13px] shadow-sm">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="bg-[#f5f5f7] border-0 rounded-full px-4 py-1.5 text-[13px] text-[#1d1d1f] font-semibold focus:outline-none"
          >
            <option value="all">All Channels</option>
            <option value="Instagram">Instagram</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Facebook">Facebook</option>
            <option value="YouTube">YouTube</option>
          </select>
        </div>
      </div>

      {/* Aggregate Metric Cards (Only Whitelisted Keys) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5">
        {Object.entries(totals).map(([key, val]) => (
          <div
            key={key}
            className="p-5 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1.5"
          >
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block capitalize">
              {key.replace(/([A-Z])/g, " $1")}
            </span>
            <div className="text-[24px] sm:text-[28px] font-bold text-[#1d1d1f] tracking-tight">
              {key === "engagementRate" ? `${val}%` : val.toLocaleString()}
            </div>
            <span className="text-[11px] text-[#34c759] font-medium flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Verified Post Totals
            </span>
          </div>
        ))}
      </div>

      {/* Platform Channel Breakdown */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-6">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-[#0071e3]" />
            <h2 className="text-[18px] font-bold text-[#1d1d1f]">Channel Breakdown</h2>
          </div>
          <span className="text-[12px] text-[#86868b]">
            Showing permitted metrics ({allowedMetricKeys.join(", ")})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Object.entries(platformBreakdown).map(([platform, metrics]) => (
            <div
              key={platform}
              className="p-5 rounded-2xl bg-[#fbfbfd] border border-black/[0.04] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[15px] text-[#1d1d1f]">{platform}</span>
                <span className="bg-white border border-black/[0.06] text-[#0071e3] text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-sm">
                  Active Channel
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-black/[0.04] text-[13px]">
                {Object.entries(metrics).map(([mKey, mVal]) => (
                  <div key={mKey} className="flex items-center justify-between">
                    <span className="text-[#86868b] capitalize">{mKey.replace(/([A-Z])/g, " $1")}:</span>
                    <span className="font-semibold text-[#1d1d1f]">
                      {mKey === "engagementRate" ? `${mVal}%` : mVal.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Performing Content Ranking Table */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-[#0071e3]" />
            <h2 className="text-[18px] font-bold text-[#1d1d1f]">Top Performing Deliverables</h2>
          </div>
          <Link
            href={`/portal/${projectId}/creatives`}
            className="text-[13px] text-[#0066cc] hover:underline font-semibold"
          >
            Creative Library →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-[#1d1d1f]">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] text-[12px] font-semibold border-b border-black/[0.08]">
              <tr>
                <th className="p-3.5 pl-4">Creative Title</th>
                <th className="p-3.5">Channel</th>
                {allowedMetricKeys.slice(0, 4).map((k) => (
                  <th key={k} className="p-3.5 capitalize">
                    {k.replace(/([A-Z])/g, " $1")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {topContent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#86868b]">
                    No published analytics records available yet.
                  </td>
                </tr>
              ) : (
                topContent.map((item) => (
                  <tr key={item.id} className="hover:bg-[#fbfbfd] transition">
                    <td className="p-3.5 pl-4 font-semibold text-[#1d1d1f] max-w-sm truncate">
                      {item.title}
                    </td>
                    <td className="p-3.5">
                      <span className="bg-[#f2f2f7] text-[#1d1d1f] px-2 py-0.5 rounded-full text-[11px] font-medium">
                        {item.platform}
                      </span>
                    </td>
                    {allowedMetricKeys.slice(0, 4).map((k) => (
                      <td key={k} className="p-3.5 font-mono font-medium">
                        {k === "engagementRate"
                          ? `${item.metrics[k] || 0}%`
                          : (item.metrics[k] || 0).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
