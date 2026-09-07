"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { useRole } from "@/lib/context/RoleContext";
import { useAppState } from "@/lib/context/AppStateContext";
import { AlertCircle } from "lucide-react";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { activeRole, activeUserId } = useRole();
  const { state } = useAppState();

  const isManagement = activeRole === "founder" || activeRole === "admin";
  const hasAccess =
    isManagement ||
    state.projects.some((p) => p.id === projectId) ||
    state.projectMemberships.some(
      (m) => m.projectId === projectId && m.userId === activeUserId && m.status === "active"
    );

  // If projects are loaded and user lacks access, reject with 403 Forbidden
  if (state.projects.length > 0 && !hasAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] text-center p-8 bg-[#f5f5f7]">
        <div className="rounded-full bg-red-50 p-3 text-red-600 mb-3">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-[#1d1d1f]">403 Forbidden — Access Denied</h2>
        <p className="text-xs text-[#86868b] max-w-md mt-1">
          You do not have an active membership for this project. Access is restricted to assigned team members.
        </p>
        <Link
          href="/projects"
          className="mt-4 rounded-full bg-[#0071e3] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0077ed] transition"
        >
          View My Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-[#ffffff]">
      {/* Apple-style Light Sidebar */}
      <Sidebar projectId={projectId} />

      {/* Main Content Pane */}
      <main className="flex-1 min-w-0 bg-[#f5f5f7]">{children}</main>
    </div>
  );
}
