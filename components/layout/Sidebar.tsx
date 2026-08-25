"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FolderKanban,
  History,
  LayoutDashboard,
  LineChart,
  Settings,
  Trello,
  Layers,
} from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";

interface SidebarProps {
  projectId: string;
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname();
  const { canViewAuditHistory, activeRole } = useRole();
  const isManagement = activeRole === "founder" || activeRole === "admin" || activeRole === "consultant";

  // Persistent user preference for sidebar collapse
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("acecore_sidebar_collapsed");
      if (stored !== null) {
        setIsCollapsed(stored === "true");
      } else if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("acecore_sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const navItems = [
    { label: "Overview", href: `/projects/${projectId}`, icon: LayoutDashboard },
    { label: "Calendar", href: `/projects/${projectId}/calendar`, icon: Calendar },
    { label: "Kanban & Timeline", href: `/projects/${projectId}/kanban`, icon: Trello },
    { label: "Approvals Queue", href: `/projects/${projectId}/approvals`, icon: CheckCircle2 },
    { label: "Script Library", href: `/projects/${projectId}/scripts`, icon: FileCode2 },
    { label: "Asset Vault", href: `/projects/${projectId}/assets`, icon: FolderKanban },
    { label: "Analytics Hub", href: `/projects/${projectId}/analytics`, icon: BarChart2 },
    ...(isManagement
      ? [{ label: "Performance", href: `/projects/${projectId}/performance`, icon: LineChart }]
      : []),
    ...(canViewAuditHistory
      ? [{ label: "Audit Trail", href: `/projects/${projectId}/audit`, icon: History }]
      : []),
    { label: "Settings", href: `/projects/${projectId}/settings`, icon: Settings },
  ];

  return (
    <aside
      className={`shrink-0 bg-[#fbfbfd] border-r border-black/[0.08] min-h-[calc(100vh-5.5rem)] p-3 flex flex-col justify-between transition-all duration-200 ${
        isCollapsed ? "w-[70px]" : "w-64"
      }`}
    >
      <div className="space-y-4">
        {/* Toggle Collapse Button */}
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} px-1 pb-1`}>
          {!isCollapsed && (
            <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
              Project Navigation
            </span>
          )}
          <button
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "Expand project navigation" : "Collapse project navigation"}
            className="p-1.5 rounded-lg border border-black/[0.06] bg-white hover:bg-[#f5f5f7] text-[#6e6e73] hover:text-[#1d1d1f] transition shadow-xs"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === `/projects/${projectId}`
                ? pathname === `/projects/${projectId}`
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex items-center ${
                  isCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3.5 py-2.5"
                } rounded-xl text-[14px] font-medium transition ${
                  isActive
                    ? "bg-[#e8e8ed] text-[#0071e3] font-semibold shadow-xs"
                    : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[#0071e3]" : "text-[#86868b]"}`} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Navigation */}
      <div className="pt-3 border-t border-black/[0.06] space-y-1">
        <Link
          href="/projects"
          title="All Projects Portfolio"
          className={`flex items-center ${
            isCollapsed ? "justify-center p-2" : "gap-2 px-3.5 py-2"
          } rounded-xl text-[13px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition`}
        >
          <Layers className="h-4 w-4 text-[#86868b] shrink-0" />
          {!isCollapsed && <span className="truncate">All Projects</span>}
        </Link>
      </div>
    </aside>
  );
}
