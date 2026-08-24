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
  Briefcase,
  Clock,
  Calendar,
  AlertCircle,
  Power,
  Edit3,
} from "lucide-react";
import { UserRole, User } from "@/lib/types";
import { formatDate } from "@/lib/formatters";

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const {
    state,
    archiveProject,
    createTeamMember,
    updateTeamMember,
    updateTeamMemberStatus,
    addProjectMember,
    removeProjectMember,
  } = useAppState();
  const { canAdmin, activeRole, activeUserId, canManageTeamMembers, canInactivateMembers } = useRole();
  const actorUserId = activeUserId;

  const project = state.projects.find((p) => p.id === projectId);
  const activeMemberships = state.projectMemberships.filter(
    (m) => m.projectId === projectId && m.status === "active"
  );
  const inactiveMemberships = state.projectMemberships.filter(
    (m) => m.projectId === projectId && m.status === "inactive"
  );

  // Add Member to Project Modal
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("designer");

  // Create New User Modal
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("designer");
  const [newUserJobTitle, setNewUserJobTitle] = useState("");
  const [newUserHours, setNewUserHours] = useState(8);

  // Inactivation Modal
  const [inactivatingUser, setInactivatingUser] = useState<User | null>(null);
  const [inactivationReason, setInactivationReason] = useState("");

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"project_team" | "org_directory">("project_team");

  if (!project) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Active users in organization who are not yet in this project
  const eligibleNonMembers = state.users.filter(
    (u) => u.status === "active" && !activeMemberships.some((m) => m.userId === u.id)
  );

  const handleAddProjectMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      alert("Please select a user to add to the project.");
      return;
    }

    const res = addProjectMember({
      projectId,
      userId: selectedUserId,
      membershipRole: selectedRole,
      actorUserId,
    });

    if (res.success) {
      setIsAddMemberModalOpen(false);
      setSelectedUserId("");
      const addedUser = state.users.find((u) => u.id === selectedUserId);
      showToast(`Added ${addedUser?.name || "member"} to project.`);
    } else {
      alert(res.error || "Failed to add member.");
    }
  };

  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) {
      alert("Please provide both name and email.");
      return;
    }

    const res = createTeamMember({
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      role: newUserRole,
      jobTitle: newUserJobTitle.trim() || undefined,
      workingHoursPerDay: Number(newUserHours) || 8,
      actorUserId,
    });

    if (res.success && res.user) {
      // Also add them to the current project
      addProjectMember({
        projectId,
        userId: res.user.id,
        membershipRole: newUserRole,
        actorUserId,
      });

      setIsCreateUserModalOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserJobTitle("");
      setNewUserHours(8);
      showToast(`Created team member '${res.user.name}' and added to project.`);
    } else {
      alert(res.error || "Failed to create user.");
    }
  };

  const handleToggleUserStatus = (user: User) => {
    if (user.status === "active") {
      setInactivatingUser(user);
      setInactivationReason("");
    } else {
      // Reactivate
      const res = updateTeamMemberStatus(user.id, "active", actorUserId);
      if (res.success) {
        showToast(`Reactivated '${user.name}'. Account is now active.`);
      } else {
        alert(res.error || "Failed to reactivate.");
      }
    }
  };

  const handleConfirmInactivation = () => {
    if (!inactivatingUser) return;
    const res = updateTeamMemberStatus(
      inactivatingUser.id,
      "inactive",
      actorUserId,
      inactivationReason.trim() || "Administrative status update"
    );
    if (res.success) {
      showToast(`Inactivated '${inactivatingUser.name}'. Historical records preserved.`);
      setInactivatingUser(null);
    } else {
      alert(res.error || "Failed to inactivate.");
    }
  };

  const handleRemoveMembership = (membershipId: string, userName: string) => {
    if (confirm(`Remove ${userName} from project "${project.name}"?`)) {
      const res = removeProjectMember(membershipId, actorUserId, "Removed by manager");
      if (res.success) {
        showToast(`Removed ${userName} from project access.`);
      } else {
        alert(res.error || "Failed to remove member.");
      }
    }
  };

  return (
    <div className="p-8 sm:p-10 max-w-5xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 rounded-2xl bg-[#1d1d1f] text-white px-4 py-2.5 text-[13px] shadow-xl animate-in fade-in slide-in-from-top-2">
          <Check className="h-4 w-4 text-[#34c759]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="pb-2 border-b border-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Team & Project Settings
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Normalized team member records, soft-inactivation, and project access permissions.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-[#ffffff] border border-black/[0.08] rounded-full p-1 shadow-sm text-[13px]">
          <button
            onClick={() => setActiveTab("project_team")}
            className={`px-3.5 py-1 rounded-full font-medium transition ${
              activeTab === "project_team" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Project Members ({activeMemberships.length})
          </button>
          <button
            onClick={() => setActiveTab("org_directory")}
            className={`px-3.5 py-1 rounded-full font-medium transition ${
              activeTab === "org_directory" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Organization Directory ({state.users.length})
          </button>
        </div>
      </div>

      {/* TAB 1: Project Team Memberships */}
      {activeTab === "project_team" && (
        <div className="space-y-6">
          {/* General Project Details Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <h2 className="text-[17px] font-semibold text-[#1d1d1f]">Project Overview</h2>

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

          {/* Project Memberships Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#0071e3]" /> Assigned Project Team
                </h2>
                <p className="text-[12px] text-[#6e6e73]">
                  Authorized members with active access to this specific project deliverable.
                </p>
              </div>

              {canManageTeamMembers && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAddMemberModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
                  >
                    <UserPlus className="h-4 w-4" /> Add Existing Member
                  </button>
                  <button
                    onClick={() => setIsCreateUserModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] border border-black/[0.06] transition"
                  >
                    <UserCheck className="h-4 w-4 text-[#0071e3]" /> Create New Person
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {activeMemberships.map((membership) => {
                const user = state.users.find((u) => u.id === membership.userId);
                const userName = user?.name || "Unknown Member";
                const isSelf = user?.id === activeUserId;

                return (
                  <div
                    key={membership.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#fbfbfd] border border-black/[0.06] text-[13px] hover:bg-[#f5f5f7]/60 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold flex items-center justify-center text-[12px] border border-black/[0.06]">
                        {user?.avatar || userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-[#1d1d1f] flex items-center gap-2">
                          <span>{userName}</span>
                          {user?.jobTitle && (
                            <span className="text-[11px] font-normal text-[#6e6e73]">
                              • {user.jobTitle}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#86868b]">{user?.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize border ${
                          membership.membershipRole === "founder"
                            ? "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]"
                            : membership.membershipRole === "consultant"
                            ? "bg-[#eaf4ff] text-[#0066cc] border-[#b8daff]"
                            : membership.membershipRole === "admin"
                            ? "bg-[#f3e8ff] text-[#6b21a8] border-[#e9d5ff]"
                            : membership.membershipRole === "client"
                            ? "bg-[#e6f4ea] text-[#137333] border-[#ceead6]"
                            : "bg-[#f2f2f7] text-[#1d1d1f] border-black/[0.06]"
                        }`}
                      >
                        {membership.membershipRole?.replace(/_/g, " ") || user?.role}
                      </span>

                      {canManageTeamMembers && !isSelf && (
                        <button
                          onClick={() => handleRemoveMembership(membership.id, userName)}
                          className="p-1 rounded-lg text-[#86868b] hover:text-[#ff3b30] hover:bg-[#ffe5e5] transition"
                          title="Remove from project"
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
        </div>
      )}

      {/* TAB 2: Organization Team Directory & Soft-Inactivation */}
      {activeTab === "org_directory" && (
        <div className="space-y-6">
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-[#0071e3]" /> Organization Team Directory
                </h2>
                <p className="text-[12px] text-[#6e6e73]">
                  All physical users across the agency. Inactivating a member preserves all historical assignments, time sessions, and audit entries.
                </p>
              </div>

              {canManageTeamMembers && (
                <button
                  onClick={() => setIsCreateUserModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
                >
                  <UserPlus className="h-4 w-4" /> Create New Member
                </button>
              )}
            </div>

            <div className="space-y-3 pt-2">
              {state.users.map((user) => {
                const isSelf = user.id === activeUserId;
                const memberProjectsCount = state.projectMemberships.filter(
                  (m) => m.userId === user.id && m.status === "active"
                ).length;

                return (
                  <div
                    key={user.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition gap-3 text-[13px] ${
                      user.status === "active"
                        ? "bg-[#ffffff] border-black/[0.08] shadow-sm"
                        : "bg-[#f5f5f7] border-black/[0.06] opacity-75"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-10 w-10 rounded-full font-semibold flex items-center justify-center text-[13px] border ${
                          user.status === "active"
                            ? "bg-[#1d1d1f] text-white border-transparent"
                            : "bg-[#86868b] text-white border-transparent"
                        }`}
                      >
                        {user.avatar || user.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#1d1d1f] text-[14px]">{user.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              user.status === "active"
                                ? "bg-[#eaf6ed] text-[#1f6f32]"
                                : "bg-[#f2f2f7] text-[#86868b]"
                            }`}
                          >
                            {user.status}
                          </span>
                        </div>
                        <div className="text-[12px] text-[#6e6e73] flex items-center gap-2">
                          <span>{user.email}</span>
                          {user.jobTitle && <span>• {user.jobTitle}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#6e6e73]">
                      <div>
                        <span className="font-semibold text-[#1d1d1f]">{memberProjectsCount}</span> project(s)
                      </div>
                      <div>
                        Joined: <span className="font-medium text-[#1d1d1f]">{formatDate(user.dateJoined)}</span>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize border ${
                          user.role === "founder"
                            ? "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]"
                            : user.role === "consultant"
                            ? "bg-[#eaf4ff] text-[#0066cc] border-[#b8daff]"
                            : user.role === "admin"
                            ? "bg-[#f3e8ff] text-[#6b21a8] border-[#e9d5ff]"
                            : user.role === "client"
                            ? "bg-[#e6f4ea] text-[#137333] border-[#ceead6]"
                            : "bg-[#f2f2f7] text-[#1d1d1f] border-black/[0.06]"
                        }`}
                      >
                        {user.role}
                      </span>

                      {canInactivateMembers && !isSelf && (
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium transition ${
                            user.status === "active"
                              ? "bg-[#fff0ee] hover:bg-[#ffe0dc] text-[#b42318]"
                              : "bg-[#eaf6ed] hover:bg-[#d5eed9] text-[#1f6f32]"
                          }`}
                        >
                          <Power className="h-3 w-3" />
                          {user.status === "active" ? "Inactivate" : "Reactivate"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Retention Section (Admins Only) */}
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

      {/* MODAL 1: Add Existing Member to Project */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-bold text-[#1d1d1f]">Add Member to Project</h3>
                <p className="text-[12px] text-[#6e6e73]">
                  Select an active organization colleague and set their project membership role.
                </p>
              </div>
              <button
                onClick={() => setIsAddMemberModalOpen(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] p-1 rounded-full hover:bg-[#f5f5f7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddProjectMemberSubmit} className="space-y-3.5 text-[13px]">
              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Select Colleague *</label>
                {eligibleNonMembers.length === 0 ? (
                  <div className="p-3 bg-[#f5f5f7] rounded-xl text-[12px] text-[#86868b]">
                    All active organization members already have project access.
                  </div>
                ) : (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  >
                    <option value="">-- Choose Colleague --</option>
                    {eligibleNonMembers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.jobTitle || u.role}) — {u.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Project Role *</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                >
                  <option value="designer">Designer / Video Editor (Creative production)</option>
                  <option value="consultant">Consultant (Strategic briefs & reviews)</option>
                  <option value="founder">Founder (Full signoff authority)</option>
                  <option value="client">Client (Restricted client portal view)</option>
                  <option value="admin">System Admin</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddMemberModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedUserId}
                  className="rounded-full bg-[#0071e3] disabled:opacity-50 hover:bg-[#0077ed] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Add to Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create New Team Member in Organization */}
      {isCreateUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-bold text-[#1d1d1f]">Create Team Member</h3>
                <p className="text-[12px] text-[#6e6e73]">
                  Register a new person into the agency directory.
                </p>
              </div>
              <button
                onClick={() => setIsCreateUserModalOpen(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] p-1 rounded-full hover:bg-[#f5f5f7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="space-y-3 text-[13px]">
              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Liam Vance"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. liam@aceassured.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Job Title / Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. 3D Animator"
                    value={newUserJobTitle}
                    onChange={(e) => setNewUserJobTitle(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                  />
                </div>

                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Working Hours/Day</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={newUserHours}
                    onChange={(e) => setNewUserHours(Number(e.target.value) || 8)}
                    className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Organization Role *</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                >
                  <option value="designer">Designer / Video Editor</option>
                  <option value="consultant">Consultant</option>
                  <option value="founder">Founder</option>
                  <option value="client">Client</option>
                  <option value="admin">System Admin</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsCreateUserModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Create & Add to Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Inactivation Confirmation with Mandatory Reason */}
      {inactivatingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#1d1d1f]">
                  Inactivate {inactivatingUser.name}?
                </h3>
                <p className="text-[12px] text-[#6e6e73]">
                  All historical work sessions, assignments, submissions, and audit entries will be permanently preserved.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">
                  Reason for Inactivation (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Contract completed, transition to freelance partner..."
                  value={inactivationReason}
                  onChange={(e) => setInactivationReason(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.06]">
              <button
                type="button"
                onClick={() => setInactivatingUser(null)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmInactivation}
                className="rounded-full bg-[#b42318] hover:bg-[#991b1b] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Confirm Inactivation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
