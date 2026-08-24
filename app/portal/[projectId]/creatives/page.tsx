"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Download,
  ExternalLink,
  Filter,
  FolderKanban,
  Layers,
  Lock,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { getClientCreativeLibrary, ClientCreativeDTO } from "@/lib/client-portal";
import { SafeImage } from "@/components/ui/SafeImage";
import { formatDate, formatDateTime } from "@/lib/formatters";

export default function ClientCreativeLibraryPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  // Filters
  const [platformFilter, setPlatformFilter] = useState("all");
  const [contentTypeFilter, setContentTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State for Selected Creative Detail
  const [selectedCreative, setSelectedCreative] = useState<ClientCreativeDTO | null>(null);

  const libraryResult = getClientCreativeLibrary(state, projectId, activeUserId, activeRole, {
    platform: platformFilter,
    contentType: contentTypeFilter,
    status: statusFilter,
    search: searchQuery,
  });

  if (libraryResult.status !== 200 || !libraryResult.data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-3xl border border-black/[0.08] bg-white p-8 space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1d1d1f]">Access Restricted</h2>
          <p className="text-[14px] text-[#6e6e73]">
            {libraryResult.error || "You do not have authorization to view this creative library."}
          </p>
        </div>
      </div>
    );
  }

  const creatives = libraryResult.data;

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#1d1d1f] tracking-tight">
            Creative Library
          </h1>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Visual library of approved, scheduled, and published marketing creative deliverables.
          </p>
        </div>

        <span className="bg-white border border-black/[0.08] text-[#1d1d1f] font-semibold text-[13px] px-3.5 py-1 rounded-full shadow-sm">
          {creatives.length} Deliverable(s)
        </span>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white border border-black/[0.08] p-3.5 rounded-2xl shadow-sm">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
          <input
            type="text"
            placeholder="Search creatives by title or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f5f5f7] border-0 rounded-xl pl-9 pr-4 py-2 text-[13px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Platforms</option>
            <option value="Instagram">Instagram</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Facebook">Facebook</option>
            <option value="YouTube">YouTube</option>
          </select>

          <select
            value={contentTypeFilter}
            onChange={(e) => setContentTypeFilter(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Formats</option>
            <option value="post">Static Post</option>
            <option value="carousel">Carousel</option>
            <option value="reel">Video / Reel</option>
            <option value="trial_reel">Trial Reel</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published Live</option>
            <option value="scheduled">Scheduled</option>
            <option value="approved">Approved</option>
          </select>
        </div>
      </div>

      {/* Creatives Grid */}
      {creatives.length === 0 ? (
        <div className="p-12 text-center bg-white border border-black/[0.08] rounded-3xl space-y-2">
          <p className="text-[15px] font-semibold text-[#1d1d1f]">No creatives match your filter criteria.</p>
          <p className="text-[13px] text-[#6e6e73]">Try resetting your search or filter selections.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {creatives.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedCreative(c)}
              className="bg-white border border-black/[0.08] rounded-3xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-lg transition cursor-pointer flex flex-col justify-between group"
            >
              {/* Media Preview Box */}
              <div className="h-56 w-full overflow-hidden bg-[#f5f5f7] relative">
                {c.assets[0]?.previewUrl ? (
                  <SafeImage
                    src={c.assets[0].previewUrl}
                    alt={c.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    fallbackTitle={c.title}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-[#86868b]">
                    <FolderKanban className="h-8 w-8 text-[#86868b] mb-1" />
                    <span className="text-[12px]">{c.platform} • {c.contentType}</span>
                  </div>
                )}

                <div className="absolute top-3.5 left-3.5 flex items-center gap-1.5">
                  <span className="bg-white/90 backdrop-blur-md rounded-full px-3 py-0.5 text-[11px] font-bold text-[#1d1d1f] shadow-sm">
                    {c.platform}
                  </span>
                  <span className="bg-black/60 backdrop-blur-md rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white capitalize">
                    {c.contentType.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="absolute bottom-3.5 right-3.5">
                  <span
                    className={`rounded-full px-3 py-0.5 text-[11px] font-bold shadow-sm capitalize ${
                      c.publishedAt
                        ? "bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]"
                        : c.scheduledDate
                        ? "bg-[#eaf4ff] text-[#0066cc] border border-[#b8daff]"
                        : "bg-white text-[#1d1d1f]"
                    }`}
                  >
                    {c.publishedAt ? "Published" : c.scheduledDate ? "Scheduled" : c.stage}
                  </span>
                </div>
              </div>

              {/* Content Body */}
              <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-[16px] text-[#1d1d1f] group-hover:text-[#0071e3] transition line-clamp-1">
                    {c.title}
                  </h3>
                  {c.groupTitle && (
                    <span className="text-[11px] text-[#86868b] flex items-center gap-1 mt-0.5">
                      <Layers className="h-3 w-3" /> Group: {c.groupTitle}
                    </span>
                  )}
                  {c.copy?.caption && (
                    <p className="text-[13px] text-[#6e6e73] line-clamp-2 mt-2 leading-relaxed">
                      {c.copy.caption}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-black/[0.04] flex items-center justify-between text-[12px]">
                  <span className="text-[#86868b]">
                    {c.publishedAt
                      ? `Live ${formatDate(c.publishedAt)}`
                      : c.scheduledDate
                      ? `Post on ${formatDate(c.scheduledDate)}`
                      : `Stage: ${c.stage}`}
                  </span>
                  <span className="text-[#0066cc] font-semibold group-hover:underline">
                    View Details →
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creative Detail Modal */}
      {selectedCreative && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-black/[0.08] bg-white p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between border-b border-black/[0.06] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-[#f5f5f7] border border-black/[0.08] text-[#1d1d1f] text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                    {selectedCreative.platform}
                  </span>
                  <span className="text-[12px] text-[#86868b] capitalize">
                    {selectedCreative.contentType.replace(/_/g, " ")}
                  </span>
                </div>
                <h2 className="text-[20px] sm:text-[24px] font-bold text-[#1d1d1f] mt-1">
                  {selectedCreative.title}
                </h2>
              </div>

              <button
                onClick={() => setSelectedCreative(null)}
                className="text-[#86868b] hover:text-[#1d1d1f] p-1 rounded-full hover:bg-[#f5f5f7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Asset Preview Display */}
            {selectedCreative.assets.length > 0 && (
              <div className="space-y-2">
                <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider block">
                  Creative Assets ({selectedCreative.assets.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedCreative.assets.map((asset) => (
                    <div
                      key={asset.assetId}
                      className="rounded-2xl overflow-hidden border border-black/[0.08] bg-[#f5f5f7] relative group"
                    >
                      <div className="h-64 w-full">
                        <SafeImage
                          src={asset.previewUrl}
                          alt={asset.filename}
                          className="w-full h-full object-cover"
                          fallbackTitle={asset.filename}
                        />
                      </div>
                      <div className="p-3 bg-white flex items-center justify-between text-[12px]">
                        <span className="font-medium text-[#1d1d1f] truncate">{asset.filename}</span>
                        <a
                          href={asset.previewUrl}
                          download={asset.filename}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#0066cc] hover:underline flex items-center gap-1 font-semibold"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Caption & Copy Text */}
            {selectedCreative.copy && (
              <div className="p-4 bg-[#fbfbfd] border border-black/[0.06] rounded-2xl space-y-3 text-[13px]">
                <div>
                  <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block mb-1">
                    Post Caption
                  </span>
                  <p className="text-[#1d1d1f] whitespace-pre-line leading-relaxed">
                    {selectedCreative.copy.caption}
                  </p>
                </div>

                {selectedCreative.copy.hashtags.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block mb-1">
                      Hashtags
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCreative.copy.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-white border border-black/[0.06] text-[#0066cc] text-[11px] px-2 py-0.5 rounded-lg"
                        >
                          #{tag.replace(/^#/, "")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCreative.copy.cta && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block mb-0.5">
                      Call to Action
                    </span>
                    <span className="font-semibold text-[#1d1d1f]">{selectedCreative.copy.cta}</span>
                  </div>
                )}
              </div>
            )}

            {/* Publication Details & Live URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
              <div className="p-3.5 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-1">
                <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                  Publication Schedule
                </span>
                <span className="font-semibold text-[#1d1d1f] block">
                  {selectedCreative.publishedAt
                    ? `Live: ${formatDateTime(selectedCreative.publishedAt)}`
                    : selectedCreative.scheduledDate
                    ? `Scheduled: ${formatDate(selectedCreative.scheduledDate)}`
                    : "Stage: Approved for Scheduling"}
                </span>
              </div>

              <div className="p-3.5 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-1">
                <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                  Live Social URL
                </span>
                {selectedCreative.liveUrl ? (
                  <a
                    href={selectedCreative.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0066cc] hover:underline font-semibold flex items-center gap-1 truncate"
                  >
                    {selectedCreative.liveUrl} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="text-[#86868b]">Will be assigned upon publication</span>
                )}
              </div>
            </div>

            {/* Permitted Analytics Metrics */}
            {Object.keys(selectedCreative.permittedMetrics).length > 0 && (
              <div className="space-y-2">
                <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider block">
                  Performance Metrics
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(selectedCreative.permittedMetrics).map(([key, val]) => (
                    <div key={key} className="p-3 bg-white border border-black/[0.08] rounded-xl text-center space-y-0.5">
                      <span className="text-[10px] text-[#86868b] uppercase tracking-wider block capitalize">
                        {key.replace(/([A-Z])/g, " $1")}
                      </span>
                      <span className="text-[16px] font-bold text-[#1d1d1f]">
                        {key === "engagementRate" ? `${val}%` : val.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-black/[0.06]">
              <button
                onClick={() => setSelectedCreative(null)}
                className="rounded-full bg-[#1d1d1f] hover:bg-[#2d2d2f] text-white px-6 py-2 text-[13px] font-semibold shadow-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
