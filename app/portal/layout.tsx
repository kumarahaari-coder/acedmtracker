"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Calendar,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  LineChart,
  Lock,
  ShieldCheck,
} from "lucide-react";

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // User's accessible projects
  const accessibleProjects = state.projects.filter((p) => {
    if (p.status === "archived") return false;
    if (activeRole === "founder" || activeRole === "admin") return true;
    return state.projectMemberships.some(
      (m) => m.projectId === p.id && m.userId === activeUserId && m.status === "active"
    );
  });

  const activeProject =
    state.projects.find((p) => p.id === projectId) || accessibleProjects[0] || state.projects[0];

  const navItems = [
    { label: "Overview", href: `/portal/${activeProject?.id || ""}`, icon: LayoutDashboard },
    { label: "Calendar", href: `/portal/${activeProject?.id || ""}/calendar`, icon: Calendar },
    { label: "Creatives", href: `/portal/${activeProject?.id || ""}/creatives`, icon: FolderKanban },
    { label: "Analytics", href: `/portal/${activeProject?.id || ""}/analytics`, icon: LineChart },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col font-sans antialiased selection:bg-[#0071e3] selection:text-white">
      {/* Role Notice Strip (Internal Managers only have Agency link; Clients do NOT see internal links) */}
      <div className="flex items-center justify-between bg-[#ffffff] border-b border-black/[0.06] px-6 py-1.5 text-[12px] text-[#6e6e73]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#eaf6ed] text-[#1f6f32] px-2 py-0.5 text-[11px] font-semibold">
            Client Portal
          </span>
          <span className="hidden sm:inline">
            Workspace for {activeProject?.clientBrand || activeProject?.name || "Client"}.
          </span>
        </div>

        {(activeRole === "founder" || activeRole === "admin" || activeRole === "consultant") && (
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-[12px] font-medium text-[#0066cc] hover:underline flex items-center gap-1"
            >
              ← Agency Workspace
            </Link>
          </div>
        )}
      </div>

      {/* Main Apple-style Client Header (60px) */}
      <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-black/[0.08] shadow-sm">
        <div className="flex h-16 items-center justify-between px-6 max-w-7xl mx-auto w-full">
          {/* Left: Brand Identity & Dedicated Workspace */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#1d1d1f] text-white flex items-center justify-center font-bold text-[14px] shadow-sm">
                {activeProject?.avatar || "A"}
              </div>
              <div>
                <span className="font-bold text-[16px] text-[#1d1d1f] tracking-tight block">
                  {activeProject?.clientBrand || activeProject?.name || "Client Portal"}
                </span>
                <span className="text-[11px] text-[#86868b] block -mt-0.5">
                  Client Portal • Ace Assured
                </span>
              </div>
            </div>

            {/* Project Switcher: Rendered ONLY if Client has multiple accessible projects */}
            {accessibleProjects.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                  className="flex items-center gap-2 rounded-full border border-black/[0.12] bg-[#ffffff] hover:bg-[#f5f5f7] px-3.5 py-1 text-[13px] font-medium text-[#1d1d1f] transition shadow-sm"
                >
                  <span className="max-w-[160px] truncate">{activeProject?.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#86868b]" />
                </button>

                {isProjectDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-64 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-xl z-50 animate-in fade-in">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                      Your Projects
                    </div>
                    {accessibleProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setIsProjectDropdownOpen(false);
                          router.push(`/portal/${p.id}`);
                        }}
                        className={`w-full text-left rounded-xl px-3 py-2 text-[13px] font-medium transition ${
                          p.id === activeProject?.id ? "bg-[#f5f5f7] text-[#0071e3]" : "hover:bg-[#f5f5f7] text-[#1d1d1f]"
                        }`}
                      >
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-[11px] text-[#86868b]">{p.clientBrand}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center/Right: Client Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-full border border-black/[0.04]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === `/portal/${activeProject?.id}`
                  ? pathname === `/portal/${activeProject?.id}`
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium transition ${
                    isActive
                      ? "bg-white text-[#1d1d1f] shadow-sm font-semibold"
                      : "text-[#6e6e73] hover:text-[#1d1d1f]"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "text-[#0071e3]" : "text-[#86868b]"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: Security Badge */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] border border-black/[0.06] px-3 py-1 text-[12px] font-medium text-[#1d1d1f]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#34c759]" /> Verified Portal
            </span>
          </div>
        </div>
      </header>

      {/* Mobile Sub-Navigation Bar */}
      <div className="md:hidden flex items-center justify-around bg-white border-b border-black/[0.06] px-4 py-2 text-[13px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === `/portal/${activeProject?.id}`
              ? pathname === `/portal/${activeProject?.id}`
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium ${
                isActive ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Portal Main Content View */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 sm:p-10">{children}</main>

      {/* Client Footer */}
      <footer className="border-t border-black/[0.06] bg-white py-6 text-center text-[12px] text-[#86868b]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>
            {activeProject?.clientBrand || "Client"} Marketing Portal • Powered by <strong>Ace Assured Marketing Operations</strong>
          </span>
          <span className="text-[11px]">
            Operating Timezone: {activeProject?.timezone || "Asia/Kolkata (IST)"}
          </span>
        </div>
      </footer>
    </div>
  );
}
