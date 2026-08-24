"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Settings,
  Users,
  UserPlus,
  Trash2,
  X,
  Check,
  Shield,
  Mail,
  UserCheck,
} from "lucide-react";
import { UserRole } from "@/lib/types";

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, archiveProject, addProjectMember, removeProjectMember } = useAppState();
  const { canAdmin, activeRole } = useRole();

  const project = state.projects.find((p) => p.id === projectId);
  const memberships = state.projectMemberships.filter((m) => m.projectId === projectId);

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExistingUserId, setSelectedExistingUserId] = useState<string>("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<UserRole>("designer");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!project) return null;

  const canManageMembers = activeRole === "admin" || activeRole === "founder" || canAdmin;

  // Find organization users who are not yet members of this project
  const nonMemberUsers = state.users.filter(
    (u) => !memberships.some((m) => m.userId === u.id)
  );

  const handleSelectExistingUser = (userId: string) => {
    setSelectedExistingUserId(userId);
    if (userId) {
      const u = state.users.find((user) => user.id === userId);
      if (u) {
        setNewMemberName(u.name);
        setNewMemberEmail(u.email);
      }
    } else {
      setNewMemberName("");
      setNewMemberEmail("");
    }
  };

  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) {
      alert("Please provide both name and email address.");
      return;
    }

    addProjectMember({
      projectId,
      name: newMemberName.trim(),
      email: newMemberEmail.trim(),
      role: newMemberRole,
    });

    setIsAddModalOpen(false);
    setSelectedExistingUserId("");
    setNewMemberName("");
    setNewMemberEmail("");
    setNewMemberRole("designer");

    setSuccessMessage(`Added ${newMemberName.trim()} to project team.`);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleRemoveMember = (userId: string, userName: string) => {
    if (confirm(`Remove ${userName} from project "${project.name}"?`)) {
      removeProjectMember(projectId, userId);
      setSuccessMessage(`Removed ${userName} from project.`);
      setTimeout(() => setSuccessMessage(null), 3500);
    }
  };

  return (
    <div className="p-8 sm:p-10 max-w-5xl mx-auto space-y-6">
      {/* Toast Notification */}
      {successMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 rounded-2xl bg-[#1d1d1f] text-white px-4 py-2.5 text-[13px] shadow-xl animate-in fade-in slide-in-from-top-2">
          <Check className="h-4 w-4 text-[#34c759]" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="pb-2 border-b border-black/[0.06]">
        <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
          Project Settings & Access
        </h1>
        <p className="text-[14px] text-[#6e6e73]">
          Project profile, target configurations, team member access, and retention policies.
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

      {/* Team Membership with Add Member Feature */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0071e3]" /> Project Members ({memberships.length})
            </h2>
            <p className="text-[12px] text-[#6e6e73]">
              Active collaborators with assigned roles on this marketing deliverable.
            </p>
          </div>

          {canManageMembers && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition active:scale-[0.98]"
            >
              <UserPlus className="h-4 w-4" /> Add Member
            </button>
          )}
        </div>

        <div className="space-y-2">
          {memberships.map((membership) => {
            const user = state.users.find((u) => u.id === membership.userId);
            const userName = user?.name || "Unknown Member";
            const isSelf = user?.id === "u_admin" || user?.id === "u_founder";

            return (
              <div
                key={membership.userId}
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#fbfbfd] border border-black/[0.06] text-[13px] hover:bg-[#f5f5f7]/60 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold flex items-center justify-center text-[12px] border border-black/[0.06]">
                    {user?.avatar || userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-[#1d1d1f]">{userName}</div>
                    <div className="text-[11px] text-[#86868b]">{user?.email || "No email on record"}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize border ${
                      membership.role === "founder"
                        ? "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]"
                        : membership.role === "consultant"
                        ? "bg-[#eaf4ff] text-[#0066cc] border-[#b8daff]"
                        : membership.role === "admin"
                        ? "bg-[#f3e8ff] text-[#6b21a8] border-[#e9d5ff]"
                        : "bg-[#f2f2f7] text-[#1d1d1f] border-black/[0.06]"
                    }`}
                  >
                    {membership.role.replace(/_/g, " ")}
                  </span>

                  {canManageMembers && !isSelf && (
                    <button
                      onClick={() => handleRemoveMember(membership.userId, userName)}
                      className="p-1 rounded-lg text-[#86868b] hover:text-[#ff3b30] hover:bg-[#ffe5e5] transition"
                      title="Remove member"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Retention */}
      {canAdmin && (
        <div className="bg-[#ffffff] border border-[#ffd5d0] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
          <h3 className="font-semibold text-[#b42318] text-[16px]">Project Retention & Archive</h3>
          <p className="text-[#6e6e73] text-[13px]">
            Archiving moves the project into a 30-day retention queue where it is retained in read-only status.
          </p>
          <button
            onClick={() => {
              if (confirm(`Archive project '${project.name}' to 30-day retention?`)) {
                archiveProject(project.id);
              }
            }}
            className="rounded-full bg-[#fff0ee] hover:bg-[#ffe0dc] px-4 py-2 text-[13px] font-medium text-[#b42318] transition"
          >
            Archive Project to 30-Day Retention
          </button>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-bold text-[#1d1d1f]">Add Team Member</h3>
                <p className="text-[12px] text-[#6e6e73]">
                  Grant access and assign a role for this project.
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] p-1 rounded-full hover:bg-[#f5f5f7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-3.5 text-[13px]">
              {/* Optional: Pick from existing users */}
              {nonMemberUsers.length > 0 && (
                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">
                    Quick Select Existing Colleague
                  </label>
                  <select
                    value={selectedExistingUserId}
                    onChange={(e) => handleSelectExistingUser(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  >
                    <option value="">-- Or enter new person details below --</option>
                    {nonMemberUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Maya Chen"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. maya@aceassured.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Project Role *</label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                >
                  <option value="designer">Designer (Uploads creative & responds to changes)</option>
                  <option value="consultant">Consultant (Creates briefs, reviews, manages analytics)</option>
                  <option value="founder">Founder (Full approval authority & overrides)</option>
                  <option value="admin">System Admin (Settings & project lifecycle)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f] hover:bg-[#e8e8ed] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm transition active:scale-[0.98]"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
