"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRole } from "@/lib/context/RoleContext";
import { useAppState } from "@/lib/context/AppStateContext";
import {
  Bell,
  Check,
  ChevronDown,
  FolderPlus,
  Search,
  Briefcase,
  LineChart,
  Users,
  LogOut,
  User,
  Shield,
} from "lucide-react";
import { productConfig, organizationConfig } from "@/lib/config/branding";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { UserAvatar } from "@/components/ui/UserAvatar";

interface HeaderProps {
  onOpenNotifDrawer: () => void;
}

export function Header({ onOpenNotifDrawer }: HeaderProps) {
  const { activeRole, activeProjectId, setActiveProjectId, userEmail, userName } = useRole();
  const { state } = useAppState();
  const pathname = usePathname();
  const router = useRouter();

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Keyboard shortcut Cmd+K or Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeProject = state.projects.find((p) => p.id === activeProjectId) || state.projects[0];
  const unreadNotifs = state.notifications.filter(
    (n) => !n.readAt && (n.projectId === activeProjectId || activeRole === "founder" || activeRole === "admin")
  ).length;

  const handleProjectSwitch = (newProjectId: string) => {
    setActiveProjectId(newProjectId);
    setIsProjectDropdownOpen(false);
    router.push(`/projects/${newProjectId}`);
  };

  const handleSignOut = async () => {
    window.location.href = "/api/auth/signout";
  };

  const currentUser = state.users.find(
    (u) => (userEmail && u.email.toLowerCase() === userEmail.toLowerCase()) || (userName && u.name === userName)
  );
  const displayName = userName || currentUser?.name || (userEmail ? userEmail.split("@")[0] : "Authorized User");
  const avatarUrl = currentUser?.avatar;

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-black/[0.08] shadow-sm">
        {/* Apple-style Main Header Navigation (56px) */}
        <div className="flex h-14 items-center justify-between px-6 max-w-7xl mx-auto w-full">
          {/* Left: Brand & My Work / Project Switcher */}
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2.5 text-[#1d1d1f] hover:opacity-80 transition group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-black/[0.08] shadow-sm overflow-hidden p-0.5 shrink-0">
                <img
                  src="/ace-assured-logo.png"
                  alt={organizationConfig.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-[15px] tracking-tight text-[#1d1d1f] leading-none">
                  {productConfig.wordmarkPrefix}
                  <span className="text-[#0071e3] font-semibold">{productConfig.wordmarkSuffix}</span>
                </span>
                <span className="text-[10px] text-[#86868b] font-medium leading-tight mt-0.5">
                  {organizationConfig.name}
                </span>
              </div>
            </Link>

            <div className="h-4 w-[1px] bg-black/[0.12] hidden sm:block" />

            {/* Top-Level Navigation */}
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                pathname === "/"
                  ? "bg-[#e8e8ed] text-[#1d1d1f]"
                  : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
              }`}
            >
              <span>Dashboard</span>
            </Link>

            <Link
              href="/calendar"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                pathname === "/calendar"
                  ? "bg-[#e8e8ed] text-[#1d1d1f]"
                  : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
              }`}
            >
              <span>Calendar</span>
            </Link>

            <Link
              href="/projects"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                pathname === "/projects" || (pathname.startsWith("/projects") && !pathname.includes("/calendar") && !pathname.includes("/approvals") && !pathname.includes("/commitments"))
                  ? "bg-[#e8e8ed] text-[#1d1d1f]"
                  : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
              }`}
            >
              <span>Projects</span>
            </Link>

            {activeRole !== "client" && (
              <Link
                href="/team"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                  pathname.startsWith("/team")
                    ? "bg-[#e8e8ed] text-[#1d1d1f]"
                    : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
                }`}
              >
                <span>Team</span>
              </Link>
            )}

            <Link
              href="/approvals"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                pathname === "/approvals"
                  ? "bg-[#e8e8ed] text-[#1d1d1f]"
                  : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
              }`}
            >
              <span>Approvals</span>
            </Link>

            {activeRole !== "client" && (
              <Link
                href="/performance"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                  pathname.startsWith("/performance")
                    ? "bg-[#e8e8ed] text-[#1d1d1f]"
                    : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
                }`}
              >
                <span>Performance</span>
              </Link>
            )}

            {(activeRole === "founder" || activeRole === "admin") && (
              <Link
                href="/admin/effort-standards"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                  pathname.startsWith("/admin")
                    ? "bg-[#e8e8ed] text-[#1d1d1f]"
                    : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
                }`}
              >
                <span>Admin</span>
              </Link>
            )}

            {/* Project Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className="flex items-center gap-2 rounded-full border border-black/[0.12] bg-[#ffffff] hover:bg-[#f5f5f7] px-3.5 py-1 text-[13px] font-medium text-[#1d1d1f] transition"
              >
                <span className="max-w-[160px] sm:max-w-[200px] truncate font-medium">
                  {activeProject?.name || (state.projects.length === 0 ? "No Projects" : "Select Project")}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[#86868b]" />
              </button>

              {isProjectDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-xl z-50 animate-in fade-in">
                  <div className="px-3 py-2 text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                    Workspace Projects
                  </div>
                  <div className="space-y-0.5 my-1">
                    {state.projects.length === 0 ? (
                      <div className="px-3 py-3 text-[12px] text-[#86868b] text-center">
                        No projects created yet.
                      </div>
                    ) : (
                      state.projects
                        .filter((p) => p.status === "active")
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleProjectSwitch(p.id)}
                            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition ${
                              p.id === activeProject?.id
                                ? "bg-[#f5f5f7] text-[#1d1d1f] font-semibold"
                                : "text-[#1d1d1f] hover:bg-[#f5f5f7]"
                            }`}
                          >
                            <div className="truncate">
                              <div className="truncate font-medium">{p.name}</div>
                              <div className="text-[11px] text-[#86868b]">{p.clientBrand}</div>
                            </div>
                            {p.id === activeProject?.id && <Check className="h-4 w-4 text-[#0071e3] shrink-0" />}
                          </button>
                        ))
                    )}
                  </div>
                  {(activeRole === "founder" || activeRole === "admin" || activeRole === "consultant") && (
                    <div className="border-t border-black/[0.06] pt-1.5 mt-1">
                      <Link
                        href="/projects"
                        onClick={() => setIsProjectDropdownOpen(false)}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-[#0066cc] hover:bg-[#f5f5f7] font-medium transition"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        Manage All Projects
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Search, Notifications & Authenticated User Profile */}
          <div className="flex items-center gap-3">
            {/* Global Search Input */}
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="flex items-center gap-2 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1 text-[13px] text-[#6e6e73] hover:text-[#1d1d1f] transition"
              title="Search operations (Cmd+K)"
            >
              <Search className="h-3.5 w-3.5 text-[#86868b]" />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden md:inline-block rounded bg-white px-1.5 py-0.2 text-[11px] text-[#86868b] border border-black/[0.08]">
                ⌘K
              </kbd>
            </button>

            {/* Notifications Button */}
            <button
              onClick={onOpenNotifDrawer}
              className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] hover:text-[#1d1d1f] transition"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifs > 0 && (
                <span className="absolute top-0 right-0 flex h-2.5 w-2.5 rounded-full bg-[#0071e3]" />
              )}
            </button>

            {/* Authenticated User Profile & Sign Out Menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-black/[0.12] bg-[#ffffff] hover:bg-[#f5f5f7] pl-1.5 pr-3 py-1 text-[13px] text-[#1d1d1f] transition"
                title="Account Settings"
              >
                <UserAvatar
                  avatar={avatarUrl}
                  name={displayName}
                  className="h-6 w-6 text-[11px]"
                  fallbackClassName="bg-[#1d1d1f] text-white"
                />
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[12px] leading-tight capitalize max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-[#0071e3] font-semibold uppercase tracking-wider leading-none">
                    {activeRole}
                  </span>
                </div>
                <ChevronDown className="h-3 w-3 text-[#86868b]" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-xl z-50 animate-in fade-in">
                  <div className="px-3 py-2 border-b border-black/[0.06]">
                    <div className="text-[13px] font-bold text-[#1d1d1f] truncate">{displayName}</div>
                    <div className="text-[11px] text-[#86868b] truncate">{userEmail}</div>
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#f0f7ff] px-2 py-0.5 text-[10px] font-semibold text-[#0071e3] border border-[#d0e5ff]">
                      <Shield className="h-2.5 w-2.5" />
                      <span className="capitalize">{activeRole}</span> • {organizationConfig.name}
                    </div>
                  </div>

                  <div className="p-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-[#d93025] hover:bg-[#fff5f5] font-medium transition"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />
    </>
  );
}
