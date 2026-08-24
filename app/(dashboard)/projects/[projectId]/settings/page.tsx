"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { Settings, Users } from "lucide-react";

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, archiveProject } = useAppState();
  const { canAdmin } = useRole();

  const project = state.projects.find((p) => p.id === projectId);
  const memberships = state.projectMemberships.filter((m) => m.projectId === projectId);

  if (!project) return null;

  return (
    <div className="p-8 sm:p-10 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-black/[0.06]">
        <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
          Project Settings
        </h1>
        <p className="text-[14px] text-[#6e6e73]">
          Project profile, target configurations, and normalized team memberships.
        </p>
      </div>

      {/* General Settings */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f]">General Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[14px]">
          <div>
            <label className="block text-[#86868b] text-[12px] mb-1">Project Name</label>
            <input
              type="text"
              readOnly
              value={project.name}
              className="w-full rounded-xl border border-black/[0.08] bg-[#f5f5f7] p-2.5 text-[#1d1d1f]"
            />
          </div>

          <div>
            <label className="block text-[#86868b] text-[12px] mb-1">Client / Brand</label>
            <input
              type="text"
              readOnly
              value={project.clientBrand}
              className="w-full rounded-xl border border-black/[0.08] bg-[#f5f5f7] p-2.5 text-[#1d1d1f]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[#86868b] text-[12px] mb-1">Scope & Objectives</label>
            <textarea
              rows={2}
              readOnly
              value={project.scope}
              className="w-full rounded-xl border border-black/[0.08] bg-[#f5f5f7] p-2.5 text-[#1d1d1f]"
            />
          </div>
        </div>
      </div>

      {/* Team Membership */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
            <Users className="h-4 w-4 text-[#0071e3]" /> Project Members
          </h2>
          <span className="text-[12px] text-[#86868b]">
            {memberships.length} assignments
          </span>
        </div>

        <div className="space-y-2">
          {memberships.map((membership) => {
            const user = state.users.find((u) => u.id === membership.userId);
            return (
              <div
                key={membership.userId}
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#fbfbfd] border border-black/[0.06] text-[13px]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold flex items-center justify-center text-[12px]">
                    {user?.avatar || "U"}
                  </div>
                  <div>
                    <div className="font-semibold text-[#1d1d1f]">{user?.name}</div>
                    <div className="text-[11px] text-[#86868b]">{user?.email}</div>
                  </div>
                </div>

                <span className="rounded-full bg-[#f2f2f7] px-3 py-1 text-[11px] font-medium capitalize text-[#1d1d1f]">
                  {membership.role.replace(/_/g, " ")}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Retention */}
      {canAdmin && (
        <div className="bg-[#ffffff] border border-[#ffd5d0] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
          <h3 className="font-semibold text-[#b42318] text-[16px]">Project Retention</h3>
          <p className="text-[#6e6e73] text-[13px]">
            Archiving moves the project into a 30-day retention queue.
          </p>
          <button
            onClick={() => {
              if (confirm(`Archive project '${project.name}'?`)) {
                archiveProject(project.id);
              }
            }}
            className="rounded-full bg-[#fff0ee] hover:bg-[#ffe0dc] px-4 py-2 text-[13px] font-medium text-[#b42318] transition"
          >
            Archive Project to 30-Day Retention
          </button>
        </div>
      )}
    </div>
  );
}
