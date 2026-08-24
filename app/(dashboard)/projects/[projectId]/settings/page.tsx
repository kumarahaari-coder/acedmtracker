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
} from "lucide-react";
import { UserRole, User } from "@/lib/types";
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
    createClientUserAndAssign,
    updateProjectClientAnalyticsConfig,
  } = useAppState();
  const { canAdmin, activeRole, activeUserId, canManageTeamMembers } = useRole();
  const actorUserId = activeUserId;

  const project = state.projects.find((p) => p.id === projectId);
  const activeMemberships = state.projectMemberships.filter(
    (m) => m.projectId === projectId && m.status === "active"
  );

  // Agency Team memberships (non-client)
  const agencyMemberships = activeMemberships.filter((m) => {
    const user = state.users.find((u) => u.id === m.userId);
    return user?.role !== "client" && m.membershipRole !== "client";
  });

  // Client memberships
  const clientMemberships = activeMemberships.filter((m) => {
    const user = state.users.find((u) => u.id === m.userId);
    return user?.role === "client" || m.membershipRole === "client";
  });

  // Add Member to Project Modal
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("designer");

  // Invite Client Modal
  const [isInviteClientModalOpen, setIsInviteClientModalOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

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

  // Active users in organization who are not yet in this project
  const eligibleNonMembers = state.users.filter(
    (u) => u.status === "active" && u.role !== "client" && !activeMemberships.some((m) => m.userId === u.id)
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

  const handleInviteClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim()) {
      alert("Please enter client name and email.");
      return;
    }

    const res = createClientUserAndAssign({
      name: clientName.trim(),
      email: clientEmail.trim(),
      projectId,
      actorUserId,
    });

    if (res.success) {
      setIsInviteClientModalOpen(false);
      setClientName("");
      setClientEmail("");
      showToast(`Granted portal access to ${clientName.trim()}.`);
    } else {
      alert(res.error || "Failed to grant client access.");
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
          href={`/portal/${projectId}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-4 py-2 text-[13px] font-medium text-[#1d1d1f] border border-black/[0.06] transition"
        >
          <ExternalLink className="h-4 w-4 text-[#0071e3]" /> Open Client Portal View ↗
        </Link>
      </div>

      {/* General Project Overview Card */}
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

      {/* CLIENT ACCESS & PORTAL MANAGEMENT (Phase 5) */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#34c759]" /> Client Portal Access
            </h2>
            <p className="text-[12px] text-[#6e6e73]">
              Authenticated client contacts authorized to view the Client Portal for this workspace.
            </p>
          </div>

          {(canAdmin || activeRole === "founder" || activeRole === "consultant") && (
            <button
              onClick={() => setIsInviteClientModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition"
            >
              <UserPlus className="h-4 w-4" /> + Invite Client Contact
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {clientMemberships.length > 0 ? (
            clientMemberships.map((membership) => {
              const user = state.users.find((u) => u.id === membership.userId);
              const userName = user?.name || "Client Representative";
              const userEmail = user?.email || "";

              return (
                <div
                  key={membership.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-black/[0.06] bg-[#fbfbfd] text-[13px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#eaf6ed] text-[#1f6f32] font-semibold flex items-center justify-center text-[13px] border border-[#ceead6]">
                      {user?.avatar || "C"}
                    </div>
                    <div>
                      <div className="font-semibold text-[#1d1d1f] flex items-center gap-2">
                        <span>{userName}</span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#eaf6ed] text-[#1f6f32] border border-[#ceead6]">
                          Portal Access Active
                        </span>
                      </div>
                      <div className="text-[11px] text-[#86868b] flex items-center gap-2 mt-0.5">
                        <span>{userEmail}</span>
                        <span>• Added {formatDate(membership.addedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {(canAdmin || activeRole === "founder" || activeRole === "consultant") && (
                    <button
                      onClick={() => handleRemoveMembership(membership.id, userName)}
                      className="text-[#86868b] hover:text-[#b42318] p-2 rounded-lg hover:bg-[#fff0ee] transition"
                      title="Revoke Portal Access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-[12px] text-[#86868b] p-4 text-center bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
              No authenticated client accounts assigned yet. Use &quot;+ Invite Client Contact&quot; to grant portal access.
            </p>
          )}
        </div>
      </div>

      {/* CLIENT ANALYTICS WHITELIST CONFIGURATION (Phase 5) */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
            <LineChart className="h-5 w-5 text-[#0071e3]" /> Client Analytics Metric Whitelist
          </h2>
          <p className="text-[12px] text-[#6e6e73]">
            Select which campaign metrics are exposed in the Client Portal. Unchecked metrics are omitted from client query payloads.
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
            Save Whitelist Configuration
          </button>
        </div>
      </div>

      {/* Assigned Internal Project Team Memberships */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0071e3]" /> Assigned Project Team
            </h2>
            <p className="text-[12px] text-[#6e6e73]">
              Authorized agency staff with active access to this specific workspace.
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
          {agencyMemberships.map((membership) => {
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
          })}
        </div>
      </div>

      {/* Project Lifecycle & Retention Card */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f]">Project Lifecycle &amp; Archival</h2>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06]">
          <div>
            <div className="font-semibold text-[#1d1d1f] text-[14px]">
              Status: <span className="capitalize text-[#0071e3]">{project.status}</span>
            </div>
            <p className="text-[12px] text-[#6e6e73] mt-0.5">
              {project.status === "active"
                ? "Active client project. All team members can collaborate on briefs and deliverables."
                : "Archived project. Workspace is read-only and preserved for 90-day retention."}
            </p>
          </div>

          {(canAdmin || activeRole === "founder") && (
            project.status === "active" ? (
              <button
                onClick={() => setIsArchiveModalOpen(true)}
                className="rounded-full bg-[#fff0ee] hover:bg-[#ffd5d0] px-4 py-1.5 text-[13px] font-medium text-[#b42318] transition"
              >
                Archive Project
              </button>
            ) : (
              <button
                onClick={() => restoreProject(project.id)}
                className="rounded-full bg-[#eaf6ed] hover:bg-[#ceead6] px-4 py-1.5 text-[13px] font-medium text-[#1f6f32] transition"
              >
                Restore Project
              </button>
            )
          )}
        </div>
      </div>

      {/* Invite Client Modal */}
      {isInviteClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Invite Client Contact</h3>
              <button onClick={() => setIsInviteClientModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleInviteClientSubmit} className="space-y-3.5 text-[13px]">
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Client Contact Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Ramesh Mehta"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Client Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. ramesh@clientdomain.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f]"
                  required
                />
              </div>

              <p className="text-[12px] text-[#6e6e73]">
                Creates an authenticated Client account and grants active portal access for this project.
              </p>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsInviteClientModalOpen(false)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Grant Portal Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Existing Member to Project Modal */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Add Team Member to Project</h3>
              <button onClick={() => setIsAddMemberModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddProjectMemberSubmit} className="space-y-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Select Agency Team Member *</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
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
                <label className="block font-medium text-[#1d1d1f] mb-1">Role on This Project *</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white"
                >
                  <option value="designer">Designer / Video Editor</option>
                  <option value="consultant">Consultant</option>
                  <option value="admin">Project Admin</option>
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
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Add to Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#b42318]">Archive Project</h3>
              <button onClick={() => setIsArchiveModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[13px] text-[#6e6e73]">
              Archiving project <strong>&quot;{project.name}&quot;</strong> will lock deliverables and begin a 90-day retention period.
            </p>

            <div>
              <label className="block font-medium text-[#1d1d1f] text-[13px] mb-1">Reason for Archiving</label>
              <textarea
                rows={2}
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. Campaign completed, client contract ended..."
                className="w-full rounded-xl border border-black/[0.12] p-2 text-[13px] text-[#1d1d1f]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  archiveProject(project.id, archiveReason.trim() || undefined);
                  setIsArchiveModalOpen(false);
                  showToast("Project archived successfully.");
                }}
                className="rounded-full bg-[#b42318] hover:bg-[#912018] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
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
