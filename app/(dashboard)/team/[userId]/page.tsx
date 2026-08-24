"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Layers,
  Mail,
  Plus,
  Shield,
  Timer,
  Trash2,
  UserCheck,
  UserX,
  X,
  AlertCircle,
} from "lucide-react";
import { UserRole, ProjectMembership } from "@/lib/types";
import { formatDate, formatDateTime, formatTime } from "@/lib/formatters";

export default function TeamMemberProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = (params?.userId as string) || "";
  const {
    state,
    updateTeamMember,
    updateTeamMemberStatus,
    addProjectMember,
    removeProjectMember,
    adjustAttendance,
  } = useAppState();
  const { activeRole, activeUserId, canAdmin } = useRole();

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("designer");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editHours, setEditHours] = useState(8);

  // Add to Project modal
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedMembershipRole, setSelectedMembershipRole] = useState<UserRole>("designer");
  const [membershipError, setMembershipError] = useState<string | null>(null);

  // Inactivate Modal
  const [isInactivateModalOpen, setIsInactivateModalOpen] = useState(false);
  const [inactivateReason, setInactivateReason] = useState("");

  // Attendance Adjustment Modal
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [adjustAttendanceId, setAdjustAttendanceId] = useState("");
  const [adjustCheckIn, setAdjustCheckIn] = useState("");
  const [adjustCheckOut, setAdjustCheckOut] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Client Security Gate
  if (activeRole === "client") {
    return (
      <div className="p-10 max-w-4xl mx-auto text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-[24px] font-bold text-[#1d1d1f]">Access Restricted</h1>
        <p className="text-[14px] text-[#6e6e73]">
          Internal personnel profiles are restricted to authorized agency team members.
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

  const user = state.users.find((u) => u.id === userId);

  if (!user) {
    return (
      <div className="p-10 max-w-4xl mx-auto text-center space-y-4">
        <h1 className="text-[24px] font-bold text-[#1d1d1f]">Team Member Not Found</h1>
        <p className="text-[14px] text-[#6e6e73]">The requested employee profile does not exist.</p>
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] px-5 py-2 text-[13px] font-medium text-white shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Team Directory
        </Link>
      </div>
    );
  }

  const userMemberships = state.projectMemberships.filter(
    (m) => m.userId === user.id && m.status === "active"
  );
  const userAssignments = state.contentAssignments.filter(
    (a) => a.assigneeUserId === user.id
  );
  const userWorkSessions = state.workSessions.filter((ws) => ws.userId === user.id);
  const userAttendanceRecords = state.attendanceRecords.filter((r) => r.userId === user.id);

  // Available projects where user is not currently an active member
  const availableProjects = state.projects.filter(
    (p) =>
      p.status === "active" &&
      !state.projectMemberships.some((m) => m.projectId === p.id && m.userId === user.id && m.status === "active")
  );

  const totalTrackedSeconds = userWorkSessions.reduce((acc, ws) => acc + ws.accumulatedSeconds, 0);
  const totalTrackedHours = (totalTrackedSeconds / 3600).toFixed(1);

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateTeamMember(
      user.id,
      {
        name: editName.trim() || user.name,
        email: editEmail.trim() || user.email,
        role: editRole,
        jobTitle: editJobTitle.trim() || undefined,
        workingHoursPerDay: editHours,
      },
      activeUserId
    );
    setIsEditModalOpen(false);
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    setMembershipError(null);
    if (!selectedProjectId) {
      setMembershipError("Please select a project.");
      return;
    }
    const res = addProjectMember({
      projectId: selectedProjectId,
      userId: user.id,
      membershipRole: selectedMembershipRole,
      actorUserId: activeUserId,
    });
    if (res.success) {
      setIsAddProjectModalOpen(false);
      setSelectedProjectId("");
    } else {
      setMembershipError(res.error || "Failed to add project membership.");
    }
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 text-[13px] text-[#6e6e73] hover:text-[#1d1d1f] font-medium transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Team Directory
        </Link>

        {(canAdmin || activeRole === "founder" || activeRole === "admin") && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditName(user.name);
                setEditEmail(user.email);
                setEditRole(user.role);
                setEditJobTitle(user.jobTitle || "");
                setEditHours(user.workingHoursPerDay || 8);
                setIsEditModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-4 py-1.5 text-[13px] font-medium text-[#1d1d1f] border border-black/[0.08] transition"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit Profile
            </button>

            {user.status === "active" ? (
              <button
                onClick={() => {
                  setInactivateReason("");
                  setIsInactivateModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-full bg-[#fff0ee] hover:bg-[#ffd5d0] px-4 py-1.5 text-[13px] font-medium text-[#b42318] transition"
              >
                <UserX className="h-3.5 w-3.5" /> Inactivate Member
              </button>
            ) : (
              <button
                onClick={() => updateTeamMemberStatus(user.id, "active", activeUserId, "Reactivated employee profile")}
                className="flex items-center gap-1.5 rounded-full bg-[#eaf6ed] hover:bg-[#ceead6] px-4 py-1.5 text-[13px] font-medium text-[#1f6f32] transition"
              >
                <UserCheck className="h-3.5 w-3.5" /> Reactivate Member
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Profile Header Card */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-bold flex items-center justify-center text-[28px] border border-black/[0.08] shadow-sm shrink-0">
            {user.avatar}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1d1d1f] tracking-tight">
                {user.name}
              </h1>
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
            <p className="text-[14px] text-[#6e6e73] font-medium">
              {user.jobTitle || user.role} • <span className="capitalize">{user.role}</span>
            </p>
            <p className="text-[13px] text-[#86868b] flex items-center gap-1.5 pt-0.5">
              <Mail className="h-3.5 w-3.5" /> {user.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-black/[0.06]">
          <div className="p-3 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] text-center">
            <span className="text-[11px] text-[#86868b] uppercase tracking-wider block font-medium">Projects</span>
            <span className="text-[20px] font-bold text-[#1d1d1f]">{userMemberships.length}</span>
          </div>
          <div className="p-3 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] text-center">
            <span className="text-[11px] text-[#86868b] uppercase tracking-wider block font-medium">Tasks</span>
            <span className="text-[20px] font-bold text-[#1d1d1f]">{userAssignments.length}</span>
          </div>
          <div className="p-3 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] text-center">
            <span className="text-[11px] text-[#86868b] uppercase tracking-wider block font-medium">Verified Hrs</span>
            <span className="text-[20px] font-bold text-[#0071e3]">{totalTrackedHours}h</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Project Memberships & Details (1 col) */}
        <div className="space-y-6">
          {/* Project Memberships Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#0071e3]" /> Project Memberships
              </h2>
              {(canAdmin || activeRole === "founder" || activeRole === "admin") && (
                <button
                  onClick={() => {
                    setSelectedProjectId(availableProjects[0]?.id || "");
                    setMembershipError(null);
                    setIsAddProjectModalOpen(true);
                  }}
                  disabled={user.status === "inactive" || availableProjects.length === 0}
                  className="text-[12px] text-[#0066cc] hover:underline font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Project
                </button>
              )}
            </div>

            <div className="space-y-2">
              {userMemberships.length > 0 ? (
                userMemberships.map((membership) => {
                  const project = state.projects.find((p) => p.id === membership.projectId);
                  return (
                    <div
                      key={membership.id}
                      className="p-3 bg-[#fbfbfd] border border-black/[0.04] rounded-xl flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <Link
                          href={`/projects/${membership.projectId}`}
                          className="text-[13px] font-semibold text-[#1d1d1f] hover:text-[#0066cc] block truncate"
                        >
                          {project?.name || membership.projectId}
                        </Link>
                        <span className="text-[11px] text-[#86868b] capitalize block">
                          Role: {membership.membershipRole || user.role} • Joined {formatDate(membership.addedAt)}
                        </span>
                      </div>

                      {(canAdmin || activeRole === "founder" || activeRole === "admin") && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${user.name} from ${project?.name || "this project"}?`)) {
                              removeProjectMember(membership.id, activeUserId, "Removed by manager");
                            }
                          }}
                          className="text-[#b42318] hover:bg-[#fff0ee] p-1.5 rounded-lg transition"
                          title="Remove Membership"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-[12px] text-[#86868b] p-3 text-center bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  No active project memberships assigned.
                </p>
              )}
            </div>
          </div>

          {/* Operational Info Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <h2 className="text-[15px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#0071e3]" /> Personnel Details
            </h2>
            <div className="space-y-2.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#86868b]">Date Joined</span>
                <span className="font-medium text-[#1d1d1f]">{formatDate(user.dateJoined)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#86868b]">Working Capacity</span>
                <span className="font-medium text-[#1d1d1f]">{user.workingHoursPerDay || 8} hrs/day</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#86868b]">Organization Role</span>
                <span className="font-medium text-[#1d1d1f] capitalize">{user.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#86868b]">Profile ID</span>
                <span className="font-mono text-[11px] text-[#86868b]">{user.id}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Active Assignments & Attendance Logs (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Deliverables / Assignments */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[#0071e3]" /> Deliverables &amp; Assignments
              </h2>
              <span className="text-[12px] text-[#86868b] font-medium">
                {userAssignments.length} Total Task(s)
              </span>
            </div>

            <div className="space-y-2.5">
              {userAssignments.length > 0 ? (
                userAssignments.map((assignment) => {
                  const item = state.contentItems.find((i) => i.id === assignment.contentItemId);
                  const project = state.projects.find((p) => p.id === assignment.projectId);

                  return (
                    <div
                      key={assignment.id}
                      className="p-3.5 bg-[#fbfbfd] border border-black/[0.06] rounded-xl flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/projects/${assignment.projectId}/content/${assignment.contentItemId}`}
                            className="font-semibold text-[13px] text-[#1d1d1f] hover:text-[#0066cc] truncate"
                          >
                            {item?.title || assignment.contentItemId}
                          </Link>
                          <span className="text-[11px] text-[#86868b]">({project?.name})</span>
                        </div>
                        <div className="text-[11px] text-[#6e6e73] mt-0.5 flex items-center gap-3">
                          <span>Due: {formatDate(assignment.currentDueAt)}</span>
                          <span>Role: {assignment.assignmentRole}</span>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-semibold capitalize px-2.5 py-0.5 rounded-full border ${
                          assignment.status === "completed"
                            ? "bg-[#eaf6ed] text-[#1f6f32] border-[#ceead6]"
                            : assignment.status === "submitted"
                            ? "bg-[#eaf4ff] text-[#0066cc] border-[#b8daff]"
                            : assignment.status === "in_progress"
                            ? "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]"
                            : "bg-[#f2f2f7] text-[#1d1d1f] border-black/[0.06]"
                        }`}
                      >
                        {assignment.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-[12px] text-[#86868b] p-4 text-center bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  No active or historical deliverable assignments found.
                </p>
              )}
            </div>
          </div>

          {/* Daily Attendance History */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#0071e3]" /> Attendance History (Asia/Kolkata)
              </h2>
              <span className="text-[12px] text-[#86868b] font-medium">
                {userAttendanceRecords.length} Logged Day(s)
              </span>
            </div>

            <div className="space-y-2">
              {userAttendanceRecords.length > 0 ? (
                userAttendanceRecords.map((att) => (
                  <div
                    key={att.id}
                    className="p-3 bg-[#fbfbfd] border border-black/[0.06] rounded-xl flex items-center justify-between text-[13px]"
                  >
                    <div>
                      <span className="font-semibold text-[#1d1d1f] block">{att.attendanceDate}</span>
                      <span className="text-[11px] text-[#6e6e73]">
                        In: {new Date(att.checkedInAt).toLocaleTimeString()}
                        {att.checkedOutAt ? ` • Out: ${new Date(att.checkedOutAt).toLocaleTimeString()}` : " (Active)"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          att.status === "checked_in"
                            ? "bg-[#eaf6ed] text-[#1f6f32]"
                            : "bg-[#f2f2f7] text-[#86868b]"
                        }`}
                      >
                        {att.status === "checked_in" ? "Present" : "Checked Out"}
                      </span>

                      {(canAdmin || activeRole === "founder" || activeRole === "admin") && (
                        <button
                          onClick={() => {
                            setAdjustAttendanceId(att.id);
                            setAdjustCheckIn(att.checkedInAt.slice(0, 16));
                            setAdjustCheckOut(att.checkedOutAt ? att.checkedOutAt.slice(0, 16) : "");
                            setAdjustReason("");
                            setIsAttendanceModalOpen(true);
                          }}
                          className="text-[11px] text-[#0066cc] hover:underline font-medium"
                        >
                          Correct...
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-[#86868b] p-4 text-center bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
                  No attendance history logged yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Team Member Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Edit Employee Profile</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSave} className="space-y-3.5 text-[13px]">
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Email Address *</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#1d1d1f] mb-1">Role *</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                  >
                    <option value="designer">Designer / Editor</option>
                    <option value="consultant">Consultant</option>
                    <option value="admin">System Admin</option>
                    <option value="founder">Founder</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[#1d1d1f] mb-1">Capacity (Hrs/Day)</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={editHours}
                    onChange={(e) => setEditHours(Number(e.target.value) || 8)}
                    required
                    className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Job Title</label>
                <input
                  type="text"
                  value={editJobTitle}
                  onChange={(e) => setEditJobTitle(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Project Membership Modal */}
      {isAddProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Grant Project Access</h3>
              <button onClick={() => setIsAddProjectModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {membershipError && (
              <div className="p-3 bg-[#fff0ee] border border-[#ffd5d0] rounded-xl text-[12px] text-[#b42318]">
                {membershipError}
              </div>
            )}

            <form onSubmit={handleAddProject} className="space-y-3.5 text-[13px]">
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Select Workspace Project *</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                >
                  {availableProjects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name} ({proj.clientBrand})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Membership Role on Project</label>
                <select
                  value={selectedMembershipRole}
                  onChange={(e) => setSelectedMembershipRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                >
                  <option value="designer">Designer / Editor</option>
                  <option value="consultant">Consultant</option>
                  <option value="admin">Project Admin</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddProjectModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Add to Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inactivate Confirmation Modal */}
      {isInactivateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#b42318]">Inactivate Team Member</h3>
              <button onClick={() => setIsInactivateModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[13px] text-[#6e6e73]">
              Inactivating <strong>{user.name}</strong> will prevent login, attendance check-in, and new project assignments while preserving all historical work sessions and audit records.
            </p>

            <div>
              <label className="block font-medium text-[#1d1d1f] text-[13px] mb-1">Reason for Inactivation *</label>
              <textarea
                rows={2}
                placeholder="e.g. End of contract, leave of absence..."
                value={inactivateReason}
                onChange={(e) => setInactivateReason(e.target.value)}
                required
                className="w-full rounded-xl border border-black/[0.12] p-2 text-[13px] text-[#1d1d1f]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
              <button
                type="button"
                onClick={() => setIsInactivateModalOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!inactivateReason.trim()) {
                    alert("Please provide a reason.");
                    return;
                  }
                  updateTeamMemberStatus(user.id, "inactive", activeUserId, inactivateReason.trim());
                  setIsInactivateModalOpen(false);
                }}
                className="rounded-full bg-[#b42318] hover:bg-[#912018] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Confirm Inactivation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Adjustment Modal */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Audited Attendance Correction</h3>
              <button onClick={() => setIsAttendanceModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!adjustReason.trim()) {
                  alert("Mandatory reason required for attendance correction.");
                  return;
                }
                adjustAttendance({
                  attendanceId: adjustAttendanceId,
                  checkedInAt: adjustCheckIn ? new Date(adjustCheckIn).toISOString() : undefined,
                  checkedOutAt: adjustCheckOut ? new Date(adjustCheckOut).toISOString() : undefined,
                  reason: adjustReason.trim(),
                  actorUserId: activeUserId,
                });
                setIsAttendanceModalOpen(false);
              }}
              className="space-y-3.5 text-[13px]"
            >
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Check-In Timestamp</label>
                <input
                  type="datetime-local"
                  value={adjustCheckIn}
                  onChange={(e) => setAdjustCheckIn(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Check-Out Timestamp</label>
                <input
                  type="datetime-local"
                  value={adjustCheckOut}
                  onChange={(e) => setAdjustCheckOut(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Mandatory Reason for Adjustment *</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Employee forgot to punch check-in on mobile..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAttendanceModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Save Audited Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
