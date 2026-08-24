"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Calendar,
  CheckCircle2,
  FileCode2,
  FolderKanban,
  History,
  LayoutDashboard,
  Settings,
  Trello,
  Layers,
} from "lucide-react";

interface SidebarProps {
  projectId: string;
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Overview", href: `/projects/${projectId}`, icon: LayoutDashboard },
    { label: "Calendar", href: `/projects/${projectId}/calendar`, icon: Calendar },
    { label: "Kanban & Timeline", href: `/projects/${projectId}/kanban`, icon: Trello },
    { label: "Approvals Queue", href: `/projects/${projectId}/approvals`, icon: CheckCircle2 },
    { label: "Script Library", href: `/projects/${projectId}/scripts`, icon: FileCode2 },
    { label: "Asset Vault", href: `/projects/${projectId}/assets`, icon: FolderKanban },
    { label: "Analytics Hub", href: `/projects/${projectId}/analytics`, icon: BarChart2 },
    { label: "Audit Trail", href: `/projects/${projectId}/audit`, icon: History },
    { label: "Settings & Team", href: `/projects/${projectId}/settings`, icon: Settings },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#fbfbfd] border-r border-black/[0.08] min-h-[calc(100vh-5.5rem)] p-4 flex flex-col justify-between">
      <div className="space-y-6">
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
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition ${
                  isActive
                    ? "bg-[#e8e8ed] text-[#0071e3] font-semibold"
                    : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-[#0071e3]" : "text-[#86868b]"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Navigation */}
      <div className="pt-4 border-t border-black/[0.06] space-y-1">
        <Link
          href="/projects"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
        >
          <Layers className="h-4 w-4 text-[#86868b]" />
          <span>All Projects Portfolio</span>
        </Link>
      </div>
    </aside>
  );
}
