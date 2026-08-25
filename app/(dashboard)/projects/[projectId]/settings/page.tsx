"use client";

import React, { useState } from "react";
import Link from "next/link";
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
  Briefcase,
  AlertCircle,
  Power,
  ExternalLink,
  ShieldCheck,
  LineChart,
  UserCheck,
  Phone,
  RotateCcw,
  Info,
} from "lucide-react";
import { UserRole, User, ProjectMembership } from "@/lib/types";
import { formatDate } from "@/lib/formatters";

const ALL_AVAILABLE_METRICS = [
  { key: "reach", label: "Organic Reach", desc: "Total unique accounts reached" },
  { key: "impressions", label: "Impressions", desc: "Total post views" },
  { key: "engagementRate", label: "Engagement Rate (%)", desc: "Interactions divided by reach" },
  { key: "clicks", label: "Link Clicks", desc: "Traffic routed to destination URLs" },
  { key: "leads", label: "Form Leads", desc: "Verified inbound lead submissions" },
  { key: "revenue", label: "Commercial Revenue ($)", desc: "Direct sales & commercial conversion value" },
  { key: "roas", label: "Return on Ad Spend (ROAS)", desc: "Campaign revenue to spend ratio" },
];

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const {
    state,
    archiveProject,
    restoreProject,
    addProjectMember,
    removeProjectMember,
    addClientToProject,
    revokeClientAccess,
    reactivateClientAccess,
    updateProjectClientAnalyticsConfig,
  } = useAppState();
  const { canAdmin, activeRole, activeUserId, canManageTeamMembers } = useRole();
  const actorUserId = activeUserId;

  const project = state.projects.find((p) => p.id === projectId);

  // Check if current user is authorized to manage client access (Founder, Admin, or Assigned Consultant)
  const isAssignedConsultant =
    activeRole === "consultant" &&
    state.projectMemberships.some(
      (m) => m.projectId === projectId && m.userId === activeUserId && m.status === "active"
    );
  const canManageClientAccess = canAdmin || activeRole === "founder" || isAssignedConsultant;

  const allProjectMemberships = state.projectMemberships.filter((m) => m.projectId === projectId);

  // Agency Team memberships (non-client, active only)
  const agencyMemberships = allProjectMemberships.filter((m) => {
    if (m.status !== "active") return false;
    const user = state.users.find((u) => u.id === m.userId);
    return user?.role !== "client" && m.membershipRole !== "client";
  });

  // Client memberships for this project (both active and revoked)
  const clientMemberships = allProjectMemberships.filter((m) => {
    const user = state.users.find((u) => u.id === m.userId);
    return user?.role === "client" || m.membershipRole === "client";
  });

  // Add Member to Project Modal (Internal Team)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("designer");

  // Add Client Modal
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientJobTitle, setClientJobTitle] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientModalError, setClientModalError] = useState<string | null>(null);

  // Client Account Detail Modal
  const [inspectClientUser, setInspectClientUser] = useState<User | null>(null);
  const [inspectClientMembership, setInspectClientMembership] = useState<ProjectMembership | null>(null);

  // Analytics Whitelist Configuration State
  const initialWhitelist = project?.clientAnalyticsConfig?.allowedMetricKeys || [
    "reach",
    "impressions",
    "engagementRate",
    "clicks",
    "leads",
  ];
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(initialWhitelist);

  // Archive Modal
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!project) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Active internal users who are not yet in this project
  const eligibleNonMembers = state.users.filter(
    (u) =>
      u.status === "active" &&
      u.role !== "client" &&
      !allProjectMemberships.some((m) => m.userId === u.id && m.status === "active")
  );

  const handleAddProjectMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      alert("Please select a team member to add.");
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

  const handleAddClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientModalError(null);

    if (!clientName.trim() || !clientEmail.trim()) {
      setClientModalError("Please enter client name and email address.");
      return;
    }

    const res = addClientToProject({
      name: clientName.trim(),
      email: clientEmail.trim(),
      jobTitle: clientJobTitle.trim() || undefined,
      phone: clientPhone.trim() || undefined,
      projectId,
      actorUserId,
    });

    if (res.success) {
      setIsAddClientModalOpen(false);
      setClientName("");
      setClientEmail("");
      setClientJobTitle("");
      setClientPhone("");
      setClientModalError(null);
      showToast(`Granted Client Portal access to ${clientName.trim()}.`);
    } else {
      setClientModalError(res.error || "Failed to add client access.");
    }
  };

  const handleRevokeClient = (userId: string, name: string) => {
    if (confirm(`Revoke Client Portal access for "${name}" on project "${project.name}"?`)) {
      const res = revokeClientAccess({
        projectId,
        userId,
        actorUserId,
        reason: "Access revoked by manager",
      });
      if (res.success) {
        showToast(`Revoked portal access for ${name}.`);
      } else {
        alert(res.error || "Failed to revoke client access.");
      }
    }
  };

  const handleReactivateClient = (userId: string, name: string) => {
    const res = reactivateClientAccess({
      projectId,
      userId,
      actorUserId,
    });
    if (res.success) {
      showToast(`Reactivated portal access for ${name}.`);
    } else {
      alert(res.error || "Failed to reactivate client access.");
    }
  };

  const handleSaveAnalyticsWhitelist = () => {
    const res = updateProjectClientAnalyticsConfig({
      projectId,
      allowedMetricKeys: selectedMetrics,
      actorUserId,
    });
    if (res.success) {
      showToast("Updated client analytics metric whitelist.");
    } else {
      alert(res.error || "Failed to update whitelist.");
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
    <div className="p-8 sm:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in">
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
            Project Settings
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Manage project team memberships, client portal access, and analytics whitelists.
          </p>
        </div>

        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0066cc] hover:text-[#0077ed]"
        >
          ← Return to Workspace
        </Link>
      </div>

      {/* 1. ASSIGNED INTERNAL PROJECT TEAM */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0071e3]" /> Assigned Project Team
            </h2>
            <p className="text-[12px] text-[#6e6e73]">
              Internal agency staff with active access to this specific workspace.
            </p>
          </div>

          {canManageTeamMembers && (
            <button
              onClick={() => {
                setSelectedUserId(eligibleNonMembers[0]?.id || "");
                setIsAddMemberModalOpen(true);
              }}
              disabled={eligibleNonMembers.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" /> Add Existing Team Member
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {agencyMemberships.length > 0 ? (
            agencyMemberships.map((membership) => {
              const user = state.users.find((u) => u.id === membership.userId);
              const userName = user?.name || "Unknown Member";
              const userEmail = user?.email || "";
              const userRole = membership.membershipRole || user?.role || "designer";

              return (
                <div
                  key={membership.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-black/[0.06] bg-[#fbfbfd] text-[13px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold flex items-center justify-center text-[13px] border border-black/[0.06]">
                      {user?.avatar || "U"}
                    </div>
                    <div>
                      <div className="font-semibold text-[#1d1d1f] flex items-center gap-2">
                        <Link href={`/team/${membership.userId}`} className="hover:text-[#0066cc] hover:underline">
                          {userName}
                        </Link>
                        <span className="capitalize text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#f0f7ff] text-[#0071e3] border border-[#d0e5ff]">
                          {userRole}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#86868b] flex items-center gap-2 mt-0.5">
                        <span>{userEmail}</span>
                        <span>• Added {formatDate(membership.addedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {canManageTeamMembers && (
                    <button
                      onClick={() => handleRemoveMembership(membership.id, userName)}
                      className="text-[#86868b] hover:text-[#b42318] p-2 rounded-lg hover:bg-[#fff0ee] transition"
                      title="Remove from project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-[12px] text-[#86868b] p-4 text-center bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
              No internal team members assigned yet.
            </p>
          )}
        </div>
      </div>

      {/* 2. CLIENT ACCESS (Dedicated Project-Level Management) */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#34c759]" /> Client Access
            </h2>
            <p className="text-[12px] text-[#6e6e73]">
              People who can access the Client Portal for this project.
            </p>
          </div>

          {canManageClientAccess && (
            <button
              onClick={() => {
                setClientModalError(null);
                setClientName("");
                setClientEmail("");
                setClientJobTitle("");
                setClientPhone("");
                setIsAddClientModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-[#1d1d1f] hover:bg-[#2d2d2f] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition"
            >
              <UserPlus className="h-4 w-4" /> + Add Client
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {clientMemberships.length > 0 ? (
            clientMemberships.map((membership) => {
              const user = state.users.find((u) => u.id === membership.userId);
              const userName = user?.name || "Client Contact";
              const userEmail = user?.email || "";
              const isActive = membership.status === "active";

              return (
                <div
                  key={membership.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition ${
                    isActive ? "border-black/[0.06] bg-[#fbfbfd]" : "border-[#ffd5d0] bg-[#fffbfb] opacity-80"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full font-bold flex items-center justify-center text-[14px] border shrink-0 ${
                        isActive
                          ? "bg-[#eaf6ed] text-[#1f6f32] border-[#ceead6]"
                          : "bg-[#f2f2f7] text-[#86868b] border-black/[0.08]"
                      }`}
                    >
                      {user?.avatar || "C"}
                    </div>
                    <div>
                      <div className="font-semibold text-[#1d1d1f] flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (user) {
                              setInspectClientUser(user);
                              setInspectClientMembership(membership);
                            }
                          }}
                          className="hover:text-[#0071e3] hover:underline text-left font-semibold text-[14px]"
                          title="Click to view client details"
                        >
                          {userName}
                        </button>

                        {isActive ? (
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]">
                            Active
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#fff0ee] text-[#b42318] border border-[#ffd5d0]">
                            Access Revoked
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#86868b] flex flex-wrap items-center gap-2 mt-0.5">
                        <span>{userEmail}</span>
                        {user?.jobTitle && <span>• {user.jobTitle}</span>}
                        <span>• Added {formatDate(membership.addedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {canManageClientAccess && (
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => {
                          if (user) {
                            setInspectClientUser(user);
                            setInspectClientMembership(membership);
                          }
                        }}
                        className="text-[12px] text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f2f2f7] px-3 py-1.5 rounded-lg font-medium transition"
                      >
                        Details
                      </button>

                      {isActive ? (
                        <button
                          onClick={() => handleRevokeClient(membership.userId, userName)}
                          className="text-[12px] text-[#b42318] hover:bg-[#fff0ee] px-3 py-1.5 rounded-lg font-medium transition border border-transparent hover:border-[#ffd5d0]"
                          title="Revoke access to this project"
                        >
                          Revoke Access
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivateClient(membership.userId, userName)}
                          className="text-[12px] text-[#1f6f32] hover:bg-[#eaf6ed] px-3 py-1.5 rounded-lg font-medium transition border border-transparent hover:border-[#ceead6] flex items-center gap-1"
                          title="Reactivate portal access for this project"
                        >
                          <RotateCcw className="h-3 w-3" /> Reactivate Access
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center p-6 bg-[#fbfbfd] rounded-2xl border border-black/[0.04] space-y-2">
              <ShieldCheck className="h-8 w-8 text-[#86868b] mx-auto opacity-60" />
              <p className="text-[13px] font-medium text-[#1d1d1f]">No Client Accounts Assigned</p>
              <p className="text-[12px] text-[#86868b] max-w-md mx-auto">
                Client users are separated from internal staff. Click &quot;+ Add Client&quot; above to grant Client Portal access for this workspace.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3. CLIENT ANALYTICS WHITELIST CONFIGURATION */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
            <LineChart className="h-5 w-5 text-[#0071e3]" /> Client Analytics
          </h2>
          <p className="text-[12px] text-[#6e6e73]">
            Metrics visible inside the Client Portal. Unchecked metrics are omitted from client query payloads.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {ALL_AVAILABLE_METRICS.map((metric) => {
            const isChecked = selectedMetrics.includes(metric.key);
            return (
              <label
                key={metric.key}
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                  isChecked ? "bg-[#f0f7ff] border-[#0071e3]" : "bg-[#fbfbfd] border-black/[0.06] hover:bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedMetrics([...selectedMetrics, metric.key]);
                    } else {
                      setSelectedMetrics(selectedMetrics.filter((k) => k !== metric.key));
                    }
                  }}
                  className="mt-0.5 rounded text-[#0071e3] focus:ring-[#0071e3]"
                />
                <div>
                  <div className="font-semibold text-[13px] text-[#1d1d1f]">{metric.label}</div>
                  <div className="text-[11px] text-[#6e6e73]">{metric.desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSaveAnalyticsWhitelist}
            className="rounded-full bg-[#1d1d1f] hover:bg-[#2d2d2f] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
          >
            Save Analytics Whitelist
          </button>
        </div>
      </div>

      {/* 4. PROJECT LIFECYCLE & RETENTION CARD */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f]">Project Lifecycle &amp; Archival</h2>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06]">
          <div>
            <div className="font-semibold text-[14px] text-[#1d1d1f]">
              Status: <span className="capitalize text-[#0071e3]">{project.status}</span>
            </div>
            <p className="text-[12px] text-[#86868b] mt-0.5">
              {project.status === "active"
                ? "Active workspaces allow active content scheduling, timer tracking, and approvals."
                : "Archived projects become strictly read-only. Timers and reviews are locked."}
            </p>
          </div>

          {canAdmin && (
            <>
              {project.status === "active" ? (
                <button
                  onClick={() => {
                    setArchiveReason("");
                    setIsArchiveModalOpen(true);
                  }}
                  className="rounded-full bg-[#fff0ee] hover:bg-[#ffd5d0] text-[#b42318] px-4 py-2 text-[13px] font-medium transition shrink-0"
                >
                  Archive Workspace
                </button>
              ) : (
                <button
                  onClick={() => {
                    restoreProject(project.id);
                    showToast(`Restored "${project.name}" to active status.`);
                  }}
                  className="rounded-full bg-[#eaf6ed] hover:bg-[#ceead6] text-[#1f6f32] px-4 py-2 text-[13px] font-medium transition shrink-0"
                >
                  Restore Workspace
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ADD TEAM MEMBER MODAL (Internal Team) */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-6 shadow-2xl border border-black/[0.08]">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#1d1d1f]">Add Team Member to Project</h2>
              <button
                onClick={() => setIsAddMemberModalOpen(false)}
                className="rounded-full p-1 text-[#86868b] hover:bg-[#f5f5f7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddProjectMemberSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Select Team Member
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                >
                  {eligibleNonMembers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role} - {u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Project Membership Role
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                >
                  <option value="designer">Designer / Creator</option>
                  <option value="consultant">Consultant / Account Lead</option>
                  <option value="admin">System Administrator</option>
                  <option value="founder">Executive / Founder</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMemberModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
                >
                  Confirm Membership
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CLIENT MODAL */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-6 shadow-2xl border border-black/[0.08]">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#1d1d1f] flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#34c759]" /> Add Client to Project
              </h2>
              <button
                onClick={() => setIsAddClientModalOpen(false)}
                className="rounded-full p-1 text-[#86868b] hover:bg-[#f5f5f7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-[13px] text-[#6e6e73] leading-relaxed">
              Grant Client Portal access to a client representative. If the email already belongs to an existing client, they will be granted access to this project.
            </p>

            {clientModalError && (
              <div className="p-3 bg-[#fff0ee] border border-[#ffd5d0] rounded-xl text-[12px] text-[#b42318] flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{clientModalError}</span>
              </div>
            )}

            <form onSubmit={handleAddClientSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Client Contact Name *
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Sarah Johnson"
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="e.g. sarah@clientbrand.com"
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Job Title / Designation <span className="font-normal text-[#86868b] lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={clientJobTitle}
                  onChange={(e) => setClientJobTitle(e.target.value)}
                  placeholder="e.g. VP Marketing, Brand Lead"
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Phone Number <span className="font-normal text-[#86868b] lowercase">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 234-5678"
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div className="p-3 bg-[#f5f5f7] rounded-xl text-[11px] text-[#6e6e73] space-y-1 border border-black/[0.04]">
                <div className="font-semibold text-[#1d1d1f] flex items-center gap-1">
                  <Info className="h-3 w-3 text-[#0071e3]" /> Client Separation Boundary
                </div>
                <p>
                  Clients only receive access to the Client Portal. They do not appear in internal team directories, task assignments, attendance records, or performance reports.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddClientModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#1d1d1f] hover:bg-[#2d2d2f] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
                >
                  Grant Portal Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLIENT ACCOUNT DETAIL MODAL */}
      {inspectClientUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-6 shadow-2xl border border-black/[0.08]">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#1d1d1f]">Client Account Details</h2>
              <button
                onClick={() => {
                  setInspectClientUser(null);
                  setInspectClientMembership(null);
                }}
                className="rounded-full p-1 text-[#86868b] hover:bg-[#f5f5f7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-4 p-4 bg-[#fbfbfd] rounded-2xl border border-black/[0.06]">
              <div className="h-12 w-12 rounded-full bg-[#eaf6ed] text-[#1f6f32] font-bold flex items-center justify-center text-[18px] border border-[#ceead6] shrink-0">
                {inspectClientUser.avatar || "C"}
              </div>
              <div>
                <h3 className="font-bold text-[16px] text-[#1d1d1f]">{inspectClientUser.name}</h3>
                <p className="text-[13px] text-[#6e6e73]">{inspectClientUser.email}</p>
                {inspectClientUser.jobTitle && (
                  <p className="text-[11px] text-[#86868b]">{inspectClientUser.jobTitle}</p>
                )}
              </div>
            </div>

            <div className="space-y-3 text-[13px]">
              <div className="flex justify-between py-1.5 border-b border-black/[0.04]">
                <span className="text-[#86868b]">Account Status</span>
                <span className="font-semibold text-[#1f6f32] capitalize">
                  {inspectClientUser.status}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-black/[0.04]">
                <span className="text-[#86868b]">This Project Access</span>
                <span
                  className={`font-semibold capitalize ${
                    inspectClientMembership?.status === "active" ? "text-[#1f6f32]" : "text-[#b42318]"
                  }`}
                >
                  {inspectClientMembership?.status === "active" ? "Active" : "Revoked"}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-black/[0.04]">
                <span className="text-[#86868b]">Member Since</span>
                <span className="font-medium text-[#1d1d1f]">
                  {formatDate(inspectClientMembership?.addedAt || inspectClientUser.createdAt)}
                </span>
              </div>

              <div>
                <span className="text-[#86868b] block mb-1.5">Projects Accessible by this Client:</span>
                <div className="space-y-1">
                  {state.projectMemberships
                    .filter((m) => m.userId === inspectClientUser.id && m.status === "active")
                    .map((m) => {
                      const p = state.projects.find((proj) => proj.id === m.projectId);
                      return (
                        <div
                          key={m.id}
                          className="px-3 py-1.5 bg-[#f5f5f7] rounded-xl text-[12px] font-medium text-[#1d1d1f] flex items-center justify-between"
                        >
                          <span>{p?.name || m.projectId}</span>
                          {m.projectId === projectId && (
                            <span className="text-[10px] text-[#0071e3] font-semibold bg-[#eaf4ff] px-1.5 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#f5f5f7] rounded-xl text-[11px] text-[#6e6e73] space-y-0.5 border border-black/[0.04]">
              <div className="font-semibold text-[#1d1d1f]">Authentication &amp; Invitation State</div>
              <p>Client account active. Portal access granted.</p>
              <p className="text-[10px] text-[#86868b]">Invitation email delivery is not configured in prototype mode.</p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setInspectClientUser(null);
                  setInspectClientMembership(null);
                }}
                className="rounded-full bg-[#1d1d1f] text-white px-5 py-2 text-[13px] font-semibold shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARCHIVE WORKSPACE MODAL */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-6 shadow-2xl border border-black/[0.08]">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#1d1d1f]">Archive Project Workspace</h2>
              <button
                onClick={() => setIsArchiveModalOpen(false)}
                className="rounded-full p-1 text-[#86868b] hover:bg-[#f5f5f7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-[13px] text-[#6e6e73]">
              Archiving &quot;{project.name}&quot; locks all content editing, timers, and submission reviews. All historical data remains fully preserved in read-only mode.
            </p>

            <div className="space-y-2">
              <label className="block text-[12px] font-semibold text-[#86868b] uppercase">
                Archival Reason / Note
              </label>
              <textarea
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. Campaign completed, client paused operations..."
                rows={3}
                className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-3 text-[13px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  archiveProject(project.id, archiveReason || "Archived by admin");
                  setIsArchiveModalOpen(false);
                  showToast(`Archived workspace "${project.name}".`);
                }}
                className="rounded-full bg-[#b42318] hover:bg-[#d92d20] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
              >
                Confirm Archival
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
