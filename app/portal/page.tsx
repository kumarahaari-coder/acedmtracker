"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { ArrowRight, FolderKanban, Lock, ShieldCheck } from "lucide-react";
import { organizationConfig } from "@/lib/config/branding";

export default function PortalIndexPage() {
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();
  const router = useRouter();

  // Find accessible projects for the active user
  const accessibleProjects = state.projects.filter((p) => {
    if (p.status === "archived") return false;
    if (activeRole === "founder" || activeRole === "admin") return true;
    return state.projectMemberships.some(
      (m) => m.projectId === p.id && m.userId === activeUserId && m.status === "active"
    );
  });

  useEffect(() => {
    // If user has access to exactly one project, immediately navigate to that project's portal
    if (accessibleProjects.length === 1) {
      router.push(`/portal/${accessibleProjects[0].id}`);
    }
  }, [accessibleProjects, router]);

  if (accessibleProjects.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-3xl border border-black/[0.08] bg-white p-8 space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto border border-[#ffd5d0]">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1d1d1f]">No Active Portal Access</h2>
          <p className="text-[14px] text-[#6e6e73] leading-relaxed">
            Your authenticated client account currently has no active workspace project memberships. Please contact your {organizationConfig.name} representative to activate your portal.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white shadow-sm"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in py-6">
      <div className="text-center space-y-2">
        <h1 className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">Select Workspace Portal</h1>
        <p className="text-[15px] text-[#6e6e73]">
          Choose the marketing workspace you would like to view.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {accessibleProjects.map((p) => (
          <Link
            key={p.id}
            href={`/portal/${p.id}`}
            className="group p-6 rounded-3xl bg-white border border-black/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-[#0071e3]/40 transition space-y-3 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-2xl bg-[#1d1d1f] text-white flex items-center justify-center font-bold text-[18px]">
                  {p.avatar || "A"}
                </div>
                <div>
                  <h3 className="font-bold text-[17px] text-[#1d1d1f] group-hover:text-[#0071e3] transition">
                    {p.name}
                  </h3>
                  <span className="text-[13px] text-[#86868b]">{p.clientBrand}</span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-[#86868b] group-hover:text-[#0071e3] group-hover:translate-x-0.5 transition" />
            </div>

            <p className="text-[13px] text-[#6e6e73] line-clamp-2">{p.scope}</p>

            <div className="pt-3 border-t border-black/[0.04] flex items-center justify-between text-[12px] text-[#86868b]">
              <span>Timezone: {p.timezone}</span>
              <span className="font-medium text-[#0071e3]">Open Portal →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
