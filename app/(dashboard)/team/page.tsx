"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Users,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Briefcase,
  Layers,
  ChevronRight,
  Shield,
  X,
  Timer,
  AlertCircle,
} from "lucide-react";
import { User, UserRole } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/formatters";

export default function GlobalTeamPage() {
  const { state, createTeamMember, updateTeamMemberStatus } = useAppState();
  const { activeRole, activeUserId, canAdmin } = useRole();
  const router = useRouter();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Add Employee Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("designer");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newWorkingHours, setNewWorkingHours] = useState(8);
  const [createError, setCreateError] = useState<string | null>(null);

  // Client Security Gate
  if (activeRole === "client") {
    return (
      <div className="p-10 max-w-4xl mx-auto text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-[24px] font-bold text-[#1d1d1f]">Access Restricted</h1>
        <p className="text-[14px] text-[#6e6e73]">
          Internal team and personnel management is restricted to authorized agency team members.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white shadow-sm"
        >
          Return to Portal
        </Link>
      </div>
    );
  }

  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Internal agency members (exclude client contacts)
  const internalUsers = state.users.filter((u) => u.role !== "client");

  // Filtered employees
  const filteredUsers = internalUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.jobTitle && u.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newName.trim() || !newEmail.trim()) {
      setCreateError("Name and email are required.");
      return;
    }

    const res = createTeamMember({
      name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
      jobTitle: newJobTitle.trim() || undefined,
      workingHoursPerDay: newWorkingHours,
      actorUserId: activeUserId,
    });

    if (res.success && res.user) {
      setIsAddModalOpen(false);
      setNewName("");
      setNewEmail("");
      setNewRole("designer");
      setNewJobTitle("");
      setNewWorkingHours(8);
      router.push(`/team/${res.user.id}`);
    } else {
      setCreateError(res.error || "Failed to create team member.");
    }
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[28px] sm:text-[34px] font-bold text-[#1d1d1f] tracking-tight">
              Organization Team
            </h1>
            <span className="bg-[#f5f5f7] border border-black/[0.08] text-[#1d1d1f] font-semibold text-[13px] px-3 py-0.5 rounded-full">
              {internalUsers.length} Members
            </span>
          </div>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Global agency directory, attendance presence, and cross-project personnel allocations.
          </p>
        </div>

        {(canAdmin || activeRole === "founder" || activeRole === "admin") && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-5 py-2.5 text-[13px] font-medium shadow-sm transition"
          >
            <Plus className="h-4 w-4" /> Add Team Member
          </button>
        )}
      </div>

      {/* Today's Team Attendance & Live Activity Bar */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#0071e3]" />
            <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Today&apos;s Attendance &amp; Activity (IST)</h2>
          </div>
          <span className="text-[12px] text-[#86868b] font-medium">
            Date: {todayDate}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {state.users
            .filter((u) => u.status === "active")
            .map((user) => {
              const todayAtt = state.attendanceRecords.find(
                (r) => r.userId === user.id && r.attendanceDate === todayDate
              );
              const activeTimer = state.workSessions.find(
                (ws) => ws.userId === user.id && ws.status === "active"
              );
              const activeItem = activeTimer
                ? state.contentItems.find((i) => i.id === activeTimer.contentItemId)
                : null;

              return (
                <div
                  key={user.id}
                  className="p-3.5 rounded-xl bg-[#fbfbfd] border border-black/[0.06] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold flex items-center justify-center text-[11px] shrink-0 border border-black/[0.06]">
                        {user.avatar}
                      </div>
                      <div className="truncate">
                        <Link
                          href={`/team/${user.id}`}
                          className="text-[13px] font-semibold text-[#1d1d1f] hover:text-[#0066cc] truncate block"
                        >
                          {user.name}
                        </Link>
                        <span className="text-[10px] text-[#86868b] uppercase tracking-wider block">
                          {user.role}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        todayAtt?.status === "checked_in"
                          ? "bg-[#eaf6ed] text-[#1f6f32]"
                          : todayAtt?.status === "checked_out"
                          ? "bg-[#fff8e6] text-[#9a6700]"
                          : "bg-[#f2f2f7] text-[#86868b]"
                      }`}
                    >
                      {todayAtt?.status === "checked_in"
                        ? "Present"
                        : todayAtt?.status === "checked_out"
                        ? "Checked Out"
                        : "Absent"}
                    </span>
                  </div>

                  {/* Presence Details */}
                  <div className="text-[11px] text-[#6e6e73] flex items-center justify-between pt-1 border-t border-black/[0.04]">
                    <span>Attendance:</span>
                    <span className="font-medium text-[#1d1d1f]">
                      {todayAtt?.status === "checked_in"
                        ? `In at ${new Date(todayAtt.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : todayAtt?.status === "checked_out"
                        ? `Out at ${new Date(todayAtt.checkedOutAt || "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Not Checked In"}
                    </span>
                  </div>

                  {/* Task Work Activity Details */}
                  <div className="text-[11px] text-[#6e6e73] flex items-center justify-between">
                    <span>Task Activity:</span>
                    <span className="font-medium truncate max-w-[130px] text-right">
                      {activeTimer && activeItem ? (
                        <span className="text-[#0066cc] flex items-center gap-1">
                          <Timer className="h-3 w-3 animate-pulse" /> {activeItem.title}
                        </span>
                      ) : (
                        <span className="text-[#86868b]">No active task</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Directory Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#ffffff] border border-black/[0.08] p-3 rounded-2xl shadow-sm">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
          <input
            type="text"
            placeholder="Search by name, email, or designation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f5f5f7] border-0 rounded-xl pl-9 pr-4 py-2 text-[13px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Roles</option>
            <option value="founder">Founders</option>
            <option value="admin">Admins</option>
            <option value="consultant">Consultants</option>
            <option value="designer">Designers / Editors</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#f5f5f7] border border-black/[0.08] rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Members</option>
            <option value="inactive">Inactive Members</option>
          </select>
        </div>
      </div>

      {/* Team Member Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredUsers.map((user) => {
          const userMemberships = state.projectMemberships.filter(
            (m) => m.userId === user.id && m.status === "active"
          );
          const activeAssignments = state.contentAssignments.filter(
            (a) => a.assigneeUserId === user.id && (a.status === "in_progress" || a.status === "assigned" || a.status === "accepted")
          );

          return (
            <div
              key={user.id}
              className={`bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition flex flex-col justify-between space-y-4 ${
                user.status === "inactive" ? "opacity-75 bg-[#fbfbfd]" : ""
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-bold flex items-center justify-center text-[15px] border border-black/[0.06]">
                      {user.avatar}
                    </div>
                    <div>
                      <Link
                        href={`/team/${user.id}`}
                        className="text-[16px] font-semibold text-[#1d1d1f] hover:text-[#0066cc] transition block truncate"
                      >
                        {user.name}
                      </Link>
                      <span className="text-[12px] text-[#6e6e73] block truncate">
                        {user.jobTitle || user.role}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                      user.status === "active"
                        ? "bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]"
                        : "bg-[#fff0ee] text-[#b42318] border border-[#ffd5d0]"
                    }`}
                  >
                    {user.status}
                  </span>
                </div>

                <div className="space-y-1 text-[12px] text-[#6e6e73] pt-1">
                  <div className="truncate">
                    <span className="text-[#86868b]">Email:</span> {user.email}
                  </div>
                  <div>
                    <span className="text-[#86868b]">Role:</span>{" "}
                    <span className="capitalize font-medium text-[#1d1d1f]">{user.role}</span>
                  </div>
                  <div>
                    <span className="text-[#86868b]">Daily Capacity:</span>{" "}
                    <span className="font-medium text-[#1d1d1f]">
                      {user.workingHoursPerDay || 8} hrs/day
                    </span>
                  </div>
                </div>

                {/* Project Memberships Tags */}
                <div className="pt-2 border-t border-black/[0.04] space-y-1.5">
                  <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                    Active Projects ({userMemberships.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                    {userMemberships.length > 0 ? (
                      userMemberships.map((m) => {
                        const proj = state.projects.find((p) => p.id === m.projectId);
                        return (
                          <span
                            key={m.id}
                            className="bg-[#f5f5f7] border border-black/[0.06] text-[#1d1d1f] text-[11px] font-medium px-2 py-0.5 rounded-lg truncate max-w-[150px]"
                          >
                            {proj?.name || m.projectId}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[11px] text-[#86868b] italic">No active project memberships</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between text-[12px]">
                <span className="text-[#86868b]">
                  {activeAssignments.length} active deliverable(s)
                </span>
                <Link
                  href={`/team/${user.id}`}
                  className="text-[#0066cc] hover:underline font-semibold flex items-center gap-1"
                >
                  View Profile <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global Add Team Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Add Organization Team Member</h3>
                <p className="text-[12px] text-[#6e6e73]">
                  Creates a global employee profile. Project memberships are assigned subsequently.
                </p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-[#fff0ee] border border-[#ffd5d0] rounded-xl text-[12px] text-[#b42318]">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateEmployee} className="space-y-3.5 text-[13px]">
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Vikram Sharma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Work Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. vikram@aceassured.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#1d1d1f] mb-1">Organization Role *</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                  >
                    <option value="designer">Designer / Editor</option>
                    <option value="consultant">Consultant</option>
                    <option value="admin">System Admin</option>
                    <option value="founder">Founder</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[#1d1d1f] mb-1">Working Hours / Day</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={newWorkingHours}
                    onChange={(e) => setNewWorkingHours(Number(e.target.value) || 8)}
                    required
                    className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Job Title / Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Senior Motion Graphics Artist"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ed]"
                >
                  Create Team Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
