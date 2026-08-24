"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Calendar,
  FileText,
  FolderArchive,
  Layers,
  Search,
  Trello,
  X,
  ExternalLink,
} from "lucide-react";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const router = useRouter();
  const { state } = useAppState();
  const { activeRole, activeUserId, setActiveProjectId } = useRole();

  const [query, setQuery] = useState("");

  if (!isOpen) return null;

  // Filter accessible projects based on role
  const accessibleProjectIds = new Set(
    activeRole === "admin" || activeRole === "founder"
      ? state.projects.map((p) => p.id)
      : state.projectMemberships
          .filter((m) => m.userId === activeUserId && m.status === "active")
          .map((m) => m.projectId)
  );

  const cleanQuery = query.trim().toLowerCase();

  // Search Results
  const matchingProjects = cleanQuery
    ? state.projects.filter(
        (p) =>
          accessibleProjectIds.has(p.id) &&
          (p.name.toLowerCase().includes(cleanQuery) || p.clientBrand.toLowerCase().includes(cleanQuery))
      )
    : [];

  const matchingItems = cleanQuery
    ? state.contentItems.filter(
        (i) =>
          accessibleProjectIds.has(i.projectId) &&
          (i.title.toLowerCase().includes(cleanQuery) ||
            i.platform.toLowerCase().includes(cleanQuery) ||
            (i.liveUrl && i.liveUrl.toLowerCase().includes(cleanQuery)))
      )
    : [];

  const matchingScripts = cleanQuery
    ? state.scripts.filter(
        (s) =>
          accessibleProjectIds.has(s.projectId) &&
          (s.title.toLowerCase().includes(cleanQuery) || s.hook.toLowerCase().includes(cleanQuery))
      )
    : [];

  const matchingAssets = cleanQuery
    ? state.assets.filter(
        (a) =>
          accessibleProjectIds.has(a.projectId) &&
          (a.name.toLowerCase().includes(cleanQuery) || a.tags.some((t) => t.toLowerCase().includes(cleanQuery)))
      )
    : [];

  const totalResults =
    matchingProjects.length + matchingItems.length + matchingScripts.length + matchingAssets.length;

  const handleNavigate = (url: string, projId?: string) => {
    if (projId) setActiveProjectId(projId);
    onClose();
    router.push(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-20 animate-in fade-in">
      <div className="w-full max-w-2xl rounded-2xl border border-black/[0.08] bg-white shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 p-4 border-b border-black/[0.06] bg-white">
          <Search className="h-5 w-5 text-[#86868b] shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search projects, deliverables, scripts, or assets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-[15px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[#86868b] hover:text-[#1d1d1f]">
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[12px] font-medium text-[#6e6e73] hover:text-[#1d1d1f]"
          >
            ESC
          </button>
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!cleanQuery ? (
            <div className="py-12 text-center text-[13px] text-[#86868b] space-y-1">
              <Search className="h-8 w-8 text-[#d2d2d7] mx-auto mb-2" />
              <p>Type to search across marketing operations data.</p>
              <p className="text-[11px] text-[#86868b]">Scoped by your active role permissions.</p>
            </div>
          ) : totalResults === 0 ? (
            <div className="py-12 text-center text-[13px] text-[#86868b]">
              No matching records found for "{query}".
            </div>
          ) : (
            <div className="space-y-4 text-[13px]">
              {/* Projects */}
              {matchingProjects.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                    Projects ({matchingProjects.length})
                  </div>
                  {matchingProjects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleNavigate(`/projects/${p.id}`, p.id)}
                      className="cursor-pointer flex items-center justify-between p-3 rounded-xl hover:bg-[#f5f5f7] transition"
                    >
                      <div>
                        <div className="font-semibold text-[#1d1d1f]">{p.name}</div>
                        <div className="text-[12px] text-[#86868b]">{p.clientBrand}</div>
                      </div>
                      <span className="text-[12px] text-[#0066cc] font-medium">Open →</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Content Items */}
              {matchingItems.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                    Deliverables ({matchingItems.length})
                  </div>
                  {matchingItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleNavigate(`/projects/${item.projectId}/content/${item.id}`, item.projectId)}
                      className="cursor-pointer flex items-center justify-between p-3 rounded-xl hover:bg-[#f5f5f7] transition"
                    >
                      <div className="space-y-0.5 truncate max-w-md">
                        <div className="font-semibold text-[#1d1d1f] truncate">{item.title}</div>
                        <div className="text-[12px] text-[#86868b]">
                          {item.platform} • {item.contentType} • {item.stage.replace("_", " ")}
                        </div>
                      </div>
                      <span className="text-[12px] text-[#0066cc] font-medium shrink-0">Open →</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Scripts */}
              {matchingScripts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                    Scripts ({matchingScripts.length})
                  </div>
                  {matchingScripts.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => handleNavigate(`/projects/${s.projectId}/scripts`, s.projectId)}
                      className="cursor-pointer flex items-center justify-between p-3 rounded-xl hover:bg-[#f5f5f7] transition"
                    >
                      <div className="space-y-0.5 truncate max-w-md">
                        <div className="font-semibold text-[#1d1d1f] truncate">{s.title}</div>
                        <div className="text-[12px] text-[#86868b]">"{s.hook}"</div>
                      </div>
                      <span className="text-[12px] text-[#0066cc] font-medium shrink-0">View →</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
