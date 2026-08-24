"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
} from "lucide-react";
import { getClientCalendar, ClientCalendarItemDTO } from "@/lib/client-portal";
import { formatDate, formatDateTime } from "@/lib/formatters";

export default function ClientCalendarPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const [filterPlatform, setFilterPlatform] = useState("all");
  const [viewMode, setViewMode] = useState<"chronological" | "published" | "scheduled">("chronological");

  const calResult = getClientCalendar(state, projectId, activeUserId, activeRole);

  if (calResult.status !== 200 || !calResult.data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-3xl border border-black/[0.08] bg-white p-8 space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1d1d1f]">Access Restricted</h2>
          <p className="text-[14px] text-[#6e6e73]">
            {calResult.error || "You do not have authorization to view this calendar."}
          </p>
        </div>
      </div>
    );
  }

  let items = calResult.data;

  if (filterPlatform !== "all") {
    items = items.filter((i) => i.platform === filterPlatform);
  }
  if (viewMode === "published") {
    items = items.filter((i) => i.status === "published");
  } else if (viewMode === "scheduled") {
    items = items.filter((i) => i.status === "scheduled");
  }

  // Sort by date descending
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#1d1d1f] tracking-tight">
            Publishing Calendar
          </h1>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Simplified publishing schedule tracking upcoming releases and published social content.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white border border-black/[0.08] p-1 rounded-full text-[13px] shadow-sm">
          <button
            onClick={() => setViewMode("chronological")}
            className={`px-4 py-1.5 rounded-full font-medium transition ${
              viewMode === "chronological" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            All Events ({calResult.data.length})
          </button>
          <button
            onClick={() => setViewMode("scheduled")}
            className={`px-4 py-1.5 rounded-full font-medium transition ${
              viewMode === "scheduled" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Scheduled
          </button>
          <button
            onClick={() => setViewMode("published")}
            className={`px-4 py-1.5 rounded-full font-medium transition ${
              viewMode === "published" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Published
          </button>
        </div>
      </div>

      {/* Platform Filter */}
      <div className="flex items-center justify-between bg-white border border-black/[0.08] p-3.5 rounded-2xl shadow-sm">
        <span className="text-[13px] font-medium text-[#6e6e73]">
          Displaying {items.length} calendar event(s)
        </span>

        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-1.5 text-[13px] text-[#1d1d1f] focus:outline-none"
        >
          <option value="all">All Channels</option>
          <option value="Instagram">Instagram</option>
          <option value="LinkedIn">LinkedIn</option>
          <option value="Facebook">Facebook</option>
          <option value="YouTube">YouTube</option>
        </select>
      </div>

      {/* Chronological List of Publishing Events */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="p-12 text-center bg-white border border-black/[0.08] rounded-3xl space-y-2">
            <p className="text-[15px] font-semibold text-[#1d1d1f]">No calendar events found.</p>
            <p className="text-[13px] text-[#6e6e73]">There are no scheduled or published posts matching this filter.</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-5 bg-white border border-black/[0.08] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[#f5f5f7] border border-black/[0.06] flex flex-col items-center justify-center text-center shrink-0">
                  <span className="text-[10px] font-bold text-[#86868b] uppercase">
                    {new Date(item.date).toLocaleDateString([], { month: "short" })}
                  </span>
                  <span className="text-[16px] font-bold text-[#1d1d1f] leading-none">
                    {new Date(item.date).toLocaleDateString([], { day: "2-digit" })}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#f5f5f7] border border-black/[0.06] text-[#1d1d1f] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                      {item.platform}
                    </span>
                    <span className="text-[12px] text-[#86868b] capitalize">
                      {item.contentType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <h3 className="font-bold text-[15px] text-[#1d1d1f]">{item.title}</h3>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-[11px] font-semibold px-3 py-1 rounded-full capitalize ${
                    item.status === "published"
                      ? "bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]"
                      : "bg-[#eaf4ff] text-[#0066cc] border border-[#b8daff]"
                  }`}
                >
                  {item.status === "published" ? "✓ Published Live" : "● Scheduled"}
                </span>

                {item.liveUrl && (
                  <a
                    href={item.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#0066cc] transition"
                    title="Open Live Post"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
