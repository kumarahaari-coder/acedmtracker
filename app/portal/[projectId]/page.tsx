"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  LineChart,
  Lock,
  Play,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { getClientProjectOverview } from "@/lib/client-portal";
import { SafeImage } from "@/components/ui/SafeImage";
import { formatDate } from "@/lib/formatters";

export default function ClientProjectOverviewPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const overviewResult = getClientProjectOverview(state, projectId, activeUserId, activeRole);

  if (overviewResult.status !== 200 || !overviewResult.data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-3xl border border-black/[0.08] bg-white p-8 space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto border border-[#ffd5d0]">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1d1d1f]">Access Restricted</h2>
          <p className="text-[14px] text-[#6e6e73] leading-relaxed">
            {overviewResult.error || "You do not have active authorization to view this client portal."}
          </p>
          <Link
            href="/portal"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white shadow-sm"
          >
            Back to Portal Index
          </Link>
        </div>
      </div>
    );
  }

  const { project, summary, recentCreatives, upcomingCalendar, performanceSnapshot } = overviewResult.data;

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Brand Hero Welcome Banner */}
      <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f5f5f7] border border-black/[0.06] text-[12px] font-semibold text-[#1d1d1f]">
            <Sparkles className="h-3.5 w-3.5 text-[#0071e3]" /> Client Brand Dashboard
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#1d1d1f] tracking-tight">
            {project.clientBrand} Overview
          </h1>
          <p className="text-[14px] text-[#6e6e73] max-w-2xl leading-relaxed">
            {project.scope}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/portal/${projectId}/creatives`}
            className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-5 py-2.5 text-[13px] font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            <FolderKanban className="h-4 w-4" /> View Creative Library
          </Link>
        </div>
      </div>

      {/* High-Level Content Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="p-5 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Published Live
          </span>
          <div className="text-[28px] sm:text-[32px] font-bold text-[#1d1d1f]">
            {summary.publishedCount}
          </div>
          <span className="text-[11px] text-[#1f6f32] font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Live on Social Channels
          </span>
        </div>

        <div className="p-5 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Scheduled Posts
          </span>
          <div className="text-[28px] sm:text-[32px] font-bold text-[#0071e3]">
            {summary.scheduledCount}
          </div>
          <span className="text-[11px] text-[#6e6e73] font-medium flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-[#0071e3]" /> Ready to Auto-Publish
          </span>
        </div>

        <div className="p-5 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Approved Creatives
          </span>
          <div className="text-[28px] sm:text-[32px] font-bold text-[#1d1d1f]">
            {summary.approvedCount}
          </div>
          <span className="text-[11px] text-[#86868b]">Verified by Agency Leadership</span>
        </div>

        <div className="p-5 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-1">
          <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider block">
            Total Deliverables
          </span>
          <div className="text-[28px] sm:text-[32px] font-bold text-[#1d1d1f]">
            {summary.totalCreatives}
          </div>
          <span className="text-[11px] text-[#86868b]">Client-Visible Content Assets</span>
        </div>
      </div>

      {/* Whitelisted Performance Snapshot */}
      {Object.keys(performanceSnapshot).length > 0 && (
        <div className="bg-white border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <LineChart className="h-5 w-5 text-[#0071e3]" />
              <h2 className="text-[18px] font-bold text-[#1d1d1f]">Performance Snapshot</h2>
            </div>
            <Link
              href={`/portal/${projectId}/analytics`}
              className="text-[13px] text-[#0066cc] hover:underline font-semibold"
            >
              Detailed Analytics →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(performanceSnapshot).map(([key, val]) => (
              <div key={key} className="p-4 rounded-2xl bg-[#fbfbfd] border border-black/[0.04] space-y-1">
                <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block capitalize">
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
                <span className="text-[22px] font-bold text-[#1d1d1f]">
                  {key === "engagementRate" ? `${val}%` : val.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Recent Creatives & Upcoming Publishing Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Recent Creatives */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-[#0071e3]" /> Recent Creatives
            </h2>
            <Link
              href={`/portal/${projectId}/creatives`}
              className="text-[13px] text-[#0066cc] hover:underline font-medium"
            >
              View All ({summary.totalCreatives}) →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentCreatives.slice(0, 4).map((c) => (
              <div
                key={c.id}
                className="bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition flex flex-col justify-between"
              >
                {c.assets[0]?.previewUrl ? (
                  <div className="h-44 w-full overflow-hidden bg-[#f5f5f7] relative">
                    <SafeImage
                      src={c.assets[0].previewUrl}
                      alt={c.title}
                      className="w-full h-full object-cover"
                      fallbackTitle={c.title}
                    />
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md rounded-full px-2.5 py-0.5 text-[11px] font-bold text-[#1d1d1f] shadow-sm">
                      {c.platform}
                    </div>
                  </div>
                ) : (
                  <div className="h-44 w-full bg-[#fbfbfd] flex items-center justify-center p-4 text-center text-[#86868b] text-[12px] border-b border-black/[0.04]">
                    {c.platform} {c.contentType}
                  </div>
                )}

                <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-[14px] text-[#1d1d1f] line-clamp-1">{c.title}</h3>
                    {c.copy?.caption && (
                      <p className="text-[12px] text-[#6e6e73] line-clamp-2 mt-1">
                        {c.copy.caption}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-black/[0.04] flex items-center justify-between text-[11px]">
                    <span className="text-[#86868b]">
                      {c.publishedAt
                        ? `Published ${formatDate(c.publishedAt)}`
                        : c.scheduledDate
                        ? `Scheduled ${formatDate(c.scheduledDate)}`
                        : `Status: ${c.stage}`}
                    </span>
                    {c.liveUrl && (
                      <a
                        href={c.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0066cc] hover:underline font-semibold flex items-center gap-0.5"
                      >
                        Live Link <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: Upcoming Publishing Schedule */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#0071e3]" /> Upcoming Publishing
            </h2>
            <Link
              href={`/portal/${projectId}/calendar`}
              className="text-[13px] text-[#0066cc] hover:underline font-medium"
            >
              Full Calendar →
            </Link>
          </div>

          <div className="bg-white border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            {upcomingCalendar.length > 0 ? (
              upcomingCalendar.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-[#fbfbfd] border border-black/[0.04] rounded-xl flex items-center justify-between gap-3 text-[13px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[#1d1d1f] truncate">{item.title}</div>
                    <div className="text-[11px] text-[#86868b] flex items-center gap-2 mt-0.5">
                      <span>{item.platform}</span>
                      <span>• {formatDate(item.date)}</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                      item.status === "published"
                        ? "bg-[#eaf6ed] text-[#1f6f32]"
                        : "bg-[#eaf4ff] text-[#0066cc]"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-[#86868b] p-4 text-center">
                No upcoming scheduled posts found.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
