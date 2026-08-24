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
  RotateCcw,
  Search,
  Briefcase,
} from "lucide-react";
import { UserRole } from "@/lib/types";
import { GlobalSearchModal } from "./GlobalSearchModal";

interface HeaderProps {
  onOpenResetModal: () => void;
  onOpenNotifDrawer: () => void;
}

export function Header({ onOpenResetModal, onOpenNotifDrawer }: HeaderProps) {
  const { activeRole, setActiveRole, activeProjectId, setActiveProjectId } = useRole();
  const { state } = useAppState();
  const pathname = usePathname();
  const router = useRouter();

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
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
    if (pathname.startsWith("/projects/")) {
      router.push(`/projects/${newProjectId}`);
    }
  };

  const roles: { role: UserRole; label: string; desc: string }[] = [
    { role: "founder", label: "Founder (Vikram Shah)", desc: "Full authority, final approvals & overrides" },
    { role: "consultant", label: "Consultant (Priyah Sharma)", desc: "Creates briefs, reviews, manages analytics" },
    { role: "designer", label: "Designer (Rohan Verma)", desc: "Uploads creative, responds to change requests" },
    { role: "admin", label: "System Admin (Alex Mercer)", desc: "Org admin, project retention, system recovery" },
    { role: "client", label: "Client (Dr. Ramesh Mehta)", desc: "Isolated client portal view" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-black/[0.08]">
        {/* Apple-style Quiet Demo Mode Information Strip */}
        <div className="flex items-center justify-between bg-[#fbfbfd] px-6 py-1.5 text-[12px] text-[#6e6e73] border-b border-black/[0.06]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
              Prototype Demo
            </span>
            <span className="hidden sm:inline">
              Interactive Phase A prototype using synthetic sample data and browser storage.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenResetModal}
              className="flex items-center gap-1 text-[12px] font-medium text-[#0066cc] hover:text-[#0077ed] transition"
              title="Reset sample state to initial deterministic baseline"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Sample Data
            </button>
          </div>
        </div>

        {/* Apple-style Main Header Navigation (56px) */}
        <div className="flex h-14 items-center justify-between px-6 max-w-7xl mx-auto w-full">
          {/* Left: Brand & My Work / Project Switcher */}
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2.5 text-[#1d1d1f] hover:opacity-80 transition group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-0.5 overflow-hidden">
                <img
                  src="/ace-assured-logo.png"
                  alt="Ace Assured"
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="font-semibold text-[15px] tracking-tight">
                Ace Assured
              </span>
            </Link>

            <div className="h-4 w-[1px] bg-black/[0.12] hidden sm:block" />

            {/* My Work Link */}
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                pathname === "/"
                  ? "bg-[#e8e8ed] text-[#1d1d1f]"
                  : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>My Work</span>
            </Link>

            {/* Simple Apple Project Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className="flex items-center gap-2 rounded-full border border-black/[0.12] bg-[#ffffff] hover:bg-[#f5f5f7] px-3.5 py-1 text-[13px] font-medium text-[#1d1d1f] transition"
              >
                <span className="max-w-[160px] sm:max-w-[200px] truncate font-medium">
                  {activeProject?.name || "Select Project"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[#86868b]" />
              </button>

              {isProjectDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-xl z-50 animate-in fade-in">
                  <div className="px-3 py-2 text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                    Workspace Projects
                  </div>
                  <div className="space-y-0.5 my-1">
                    {state.projects
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
                      ))}
                  </div>
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
                </div>
              )}
            </div>
          </div>

          {/* Right: Global Search, Role Simulation Selector & Notifications */}
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

            {/* Restrained Role Simulation Selector */}
            <div className="relative">
              <button
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                className="flex items-center gap-2 rounded-full border border-black/[0.12] bg-[#ffffff] hover:bg-[#f5f5f7] px-3.5 py-1 text-[13px] text-[#1d1d1f] transition"
                title="Simulate different role perspectives"
              >
                <span className="text-[12px] text-[#86868b]">Role:</span>
                <span className="font-medium capitalize">
                  {activeRole.replace("_", " ")}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[#86868b]" />
              </button>

              {isRoleDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-xl z-50 animate-in fade-in">
                  <div className="px-3 py-2">
                    <div className="text-[13px] font-semibold text-[#1d1d1f]">Role Simulation</div>
                    <p className="text-[11px] text-[#86868b] mt-0.5">
                      Simulate role-based views and permissions.
                    </p>
                  </div>
                  <div className="space-y-0.5 my-1">
                    {roles.map((r) => (
                      <button
                        key={r.role}
                        onClick={() => {
                          setActiveRole(r.role);
                          setIsRoleDropdownOpen(false);
                        }}
                        className={`w-full flex items-start justify-between rounded-xl p-2.5 text-left text-[13px] transition ${
                          activeRole === r.role
                            ? "bg-[#f5f5f7] text-[#1d1d1f] font-semibold"
                            : "text-[#1d1d1f] hover:bg-[#f5f5f7]"
                        }`}
                      >
                        <div>
                          <div className="font-medium">{r.label}</div>
                          <div className="text-[11px] text-[#86868b]">{r.desc}</div>
                        </div>
                        {activeRole === r.role && <Check className="h-4 w-4 text-[#0071e3] shrink-0 mt-0.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
