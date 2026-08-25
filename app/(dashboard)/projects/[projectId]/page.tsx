"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Layers,
  Play,
  Plus,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { formatDate, formatDurationHuman } from "@/lib/formatters";
import { ContentPlatform, ContentType, ScopeClassification } from "@/lib/types";

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, updateProjectObjective } = useAppState();
  const { activeRole, activeUserId, canApprove } = useRole();

  const isManagement = activeRole === "founder" || activeRole === "consultant" || activeRole === "admin";

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;

  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  const projectMembers = state.projectMemberships
    .filter((m) => m.projectId === projectId && m.status === "active")
    .map((m) => {
      const user = state.users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        name: user?.name || m.userId,
        role: m.membershipRole || user?.role || "designer",
        avatar: user?.avatar || "U",
      };
    });

  // Filters for Assigned Work view
  const [filterDesigner, setFilterDesigner] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");

  // Objective Update Modal state
  const [isObjectiveModalOpen, setIsObjectiveModalOpen] = useState(false);
  const [newObjectiveValue, setNewObjectiveValue] = useState<number>(
    project.objectiveConfig?.currentValue || 0
  );

  // Deliverables by stage
  const publishedItems = projectItems.filter((i) => i.stage === "published");
  const inReviewItems = projectItems.filter((i) => i.stage === "in_review" || i.stage === "submitted");
  const changesReqItems = projectItems.filter((i) => i.stage === "changes_requested");
  const scheduledItems = projectItems.filter((i) => i.stage === "scheduled");

  // Contracted vs Goodwill vs Additional Billable breakdown
  const contractedItems = projectItems.filter(
    (i) => !i.scopeClassification || i.scopeClassification === "contracted"
  );
  const goodwillItems = projectItems.filter((i) => i.scopeClassification === "goodwill");
  const additionalBillableItems = projectItems.filter((i) => i.scopeClassification === "additional_billable");

  const completedContracted = contractedItems.filter((i) => i.stage === "published" || i.stage === "approved");
  const completedGoodwill = goodwillItems.filter((i) => i.stage === "published" || i.stage === "approved");
  const completedAdditional = additionalBillableItems.filter((i) => i.stage === "published" || i.stage === "approved");

  // Deliverable-Based Metrics
  const totalContractedTarget =
    project.targetRequirements.posts +
    project.targetRequirements.carousels +
    project.targetRequirements.reels +
    project.targetRequirements.trialReels;

  const deliverableCompletionPercentage =
    totalContractedTarget > 0
      ? Math.min(100, Math.round((completedContracted.length / totalContractedTarget) * 100))
      : 0;

  // Objective-Based Metrics
  const isObjectiveModel = project.engagementModel === "objective_based";
  const objective = project.objectiveConfig;
  const objectivePercentage =
    objective && objective.targetValue > 0
      ? Math.min(100, Math.round((objective.currentValue / objective.targetValue) * 100))
      : 0;

  // Overdue / Escalated Items
  const now = new Date();
  const overdueItems = projectItems.filter((i) => {
    if (i.stage === "published" || i.stage === "approved") return false;
    const deadline = i.deadlines.resubmissionDeadline || i.deadlines.submissionDeadline;
    if (!deadline) return false;
    return new Date(deadline).getTime() < now.getTime();
  });

  // Filtered Deliverables list for Assigned-Work view
  const filteredDeliverables = projectItems.filter((item) => {
    const asgn = state.contentAssignments.find(
      (a) => a.contentItemId === item.id && a.status !== "reassigned"
    );
    const primaryOwner = asgn?.assigneeUserId || item.accountableOwnerId;
    const status = asgn?.status || "assigned";
    const scope = item.scopeClassification || "contracted";

    if (filterDesigner !== "all" && primaryOwner !== filterDesigner) return false;
    if (filterStatus !== "all" && status !== filterStatus) return false;
    if (filterScope !== "all" && scope !== filterScope) return false;
    if (filterPlatform !== "all" && item.platform !== filterPlatform) return false;

    return true;
  });

  const handleObjectiveUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateProjectObjective({
      projectId,
      updates: { currentValue: Number(newObjectiveValue) },
      actorUserId: activeUserId,
    });
    setIsObjectiveModalOpen(false);
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Apple-style Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#0066cc]">
            <span>{project.clientBrand}</span>
            <span>•</span>
            <span className="capitalize">{project.engagementModel?.replace("_", "-") || "Deliverable-Based"}</span>
            <span>•</span>
            <span>{project.timezone}</span>
          </div>
          <h1 className="text-[32px] sm:text-[38px] font-bold text-[#1d1d1f] tracking-tight leading-tight">
            {project.name}
          </h1>
          <p className="text-[14px] text-[#6e6e73] font-normal max-w-3xl">
            {project.scope}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}/calendar`}
            className="flex items-center gap-1.5 rounded-full bg-[#ffffff] border border-black/[0.08] hover:bg-[#f5f5f7] px-4 py-2 text-[13px] font-medium text-[#1d1d1f] shadow-xs transition"
          >
            <Calendar className="h-4 w-4 text-[#0071e3]" /> Calendar
          </Link>
          <Link
            href={`/projects/${projectId}/kanban`}
            className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition"
          >
            Kanban Board <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* CORE ENGAGEMENT MODEL EXECUTIVE BANNER & KPIS */}
      {isObjectiveModel && objective ? (
        /* Objective-Based Project Banner */
        <div className="bg-[#1d1d1f] text-white rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#0071e3]/20 text-[#0071e3] flex items-center justify-center font-bold">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0071e3]">
                  Objective-Based Engagement
                </span>
                <h3 className="text-[20px] font-bold text-white tracking-tight">{objective.objectiveName}</h3>
              </div>
            </div>

            {isManagement && (
              <button
                onClick={() => {
                  setNewObjectiveValue(objective.currentValue);
                  setIsObjectiveModalOpen(true);
                }}
                className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium transition"
              >
                Update Progress...
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-3 bg-white/5 rounded-xl">
              <span className="text-[11px] text-[#86868b] block uppercase">Current Attained</span>
              <span className="text-[24px] font-bold text-white">
                {objective.currentValue.toLocaleString()} {objective.unit || ""}
              </span>
            </div>
            <div className="p-3 bg-white/5 rounded-xl">
              <span className="text-[11px] text-[#86868b] block uppercase">Contract Target</span>
              <span className="text-[24px] font-bold text-white">
                {objective.targetValue.toLocaleString()} {objective.unit || ""}
              </span>
            </div>
            <div className="p-3 bg-white/5 rounded-xl">
              <span className="text-[11px] text-[#86868b] block uppercase">Target Attainment</span>
              <span className="text-[24px] font-bold text-[#34c759]">{objectivePercentage}%</span>
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#34c759] transition-all duration-500"
                style={{ width: `${objectivePercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#86868b]">
              <span>Metric: {objective.metricName}</span>
              {objective.targetDate && <span>Target Date: {formatDate(objective.targetDate)}</span>}
            </div>
          </div>
        </div>
      ) : (
        /* Deliverable-Based Project Summary Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Contracted Deliverables Progress */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6e6e73]">Contracted Deliverables</span>
              <span className="text-[13px] font-bold text-[#0071e3]">{deliverableCompletionPercentage}%</span>
            </div>
            <div className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">
              {completedContracted.length} <span className="text-[18px] text-[#86868b] font-normal">/ {totalContractedTarget}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#f2f2f7] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0071e3] transition-all duration-300"
                style={{ width: `${deliverableCompletionPercentage}%` }}
              />
            </div>
            <div className="text-[11px] text-[#86868b]">
              Agreed: {project.targetRequirements.posts}p, {project.targetRequirements.carousels}c, {project.targetRequirements.reels}r
            </div>
          </div>

          {/* Goodwill & Extra Output */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6e6e73]">Value-Add / Goodwill</span>
              <span className="text-[11px] font-bold status-approved px-2 py-0.5 rounded-full">Delivered</span>
            </div>
            <div className="text-[32px] font-bold text-[#1f6f32] tracking-tight">
              {completedGoodwill.length} <span className="text-[14px] text-[#86868b] font-medium">Goodwill Items</span>
            </div>
            <div className="text-[12px] text-[#6e6e73]">
              + {completedAdditional.length} additional billables delivered
            </div>
          </div>

          {/* Overdue / Approvals in Queue */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6e6e73]">Awaiting Review</span>
              <CheckCircle2 className="h-4 w-4 text-[#9a6700]" />
            </div>
            <div className="text-[32px] font-bold text-[#9a6700] tracking-tight">
              {inReviewItems.length}
            </div>
            <div className="text-[12px] text-[#86868b]">
              {overdueItems.length > 0 ? (
                <span className="text-[#d70015] font-semibold">{overdueItems.length} deliverable(s) overdue</span>
              ) : (
                "All items on schedule"
              )}
            </div>
          </div>

          {/* Total Pipeline Volume */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6e6e73]">Total Pipeline</span>
              <Clock className="h-4 w-4 text-[#0071e3]" />
            </div>
            <div className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">
              {projectItems.length} <span className="text-[14px] text-[#86868b] font-normal">items</span>
            </div>
            <div className="text-[12px] text-[#86868b]">
              {publishedItems.length} published • {scheduledItems.length} scheduled
            </div>
          </div>
        </div>
      )}

      {/* ASSIGNED WORK & OWNERSHIP BOARD (Phase 2 & Post-UAT Area 5) */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
          <div>
            <h2 className="text-[20px] font-bold text-[#1d1d1f] tracking-tight flex items-center gap-2">
              <Users className="h-5 w-5 text-[#0071e3]" /> Project Assigned Work &amp; Ownership
            </h2>
            <p className="text-[13px] text-[#6e6e73] mt-0.5">
              Authoritative work ownership, assigned designers, deliverable stages, and verified productive tracked time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#86868b] uppercase">
              Showing: {filteredDeliverables.length} of {projectItems.length}
            </span>
          </div>
        </div>

        {/* 4-Part Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3 bg-[#fbfbfd] p-3.5 rounded-xl border border-black/[0.06]">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#6e6e73]">
            <Filter className="h-3.5 w-3.5 text-[#0071e3]" /> Filters:
          </div>

          {/* Designer Filter */}
          <select
            value={filterDesigner}
            onChange={(e) => setFilterDesigner(e.target.value)}
            className="rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Designers</option>
            {projectMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Assignment Statuses</option>
            <option value="assigned">Assigned (Pending Accept)</option>
            <option value="accepted">Accepted (Ready to Start)</option>
            <option value="in_progress">In Progress (Timer Active)</option>
            <option value="submitted">Submitted for Review</option>
            <option value="completed">Completed / Approved</option>
          </select>

          {/* Scope Filter */}
          <select
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value)}
            className="rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Scope Types</option>
            <option value="contracted">Contracted Scope</option>
            <option value="goodwill">Goodwill (Value-Add)</option>
            <option value="additional_billable">Additional Billable</option>
          </select>

          {/* Platform Filter */}
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1d1d1f] focus:outline-none"
          >
            <option value="all">All Platforms</option>
            <option value="Instagram">Instagram</option>
            <option value="Facebook">Facebook</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="YouTube">YouTube</option>
            <option value="X">X (Twitter)</option>
            <option value="Email">Email</option>
          </select>

          {(filterDesigner !== "all" || filterStatus !== "all" || filterScope !== "all" || filterPlatform !== "all") && (
            <button
              onClick={() => {
                setFilterDesigner("all");
                setFilterStatus("all");
                setFilterScope("all");
                setFilterPlatform("all");
              }}
              className="text-[12px] text-[#0066cc] hover:underline font-medium ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Assigned Deliverables Table */}
        <div className="overflow-x-auto rounded-xl border border-black/[0.08]">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] font-semibold border-b border-black/[0.06]">
              <tr>
                <th className="px-4 py-3">Deliverable &amp; Platform</th>
                <th className="px-4 py-3">Scope Classification</th>
                <th className="px-4 py-3">Primary Designer</th>
                <th className="px-4 py-3">Assignment Status</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Tracked Effort</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {filteredDeliverables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#86868b]">
                    No deliverables match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredDeliverables.map((item) => {
                  const asgn = state.contentAssignments.find(
                    (a) => a.contentItemId === item.id && a.status !== "reassigned"
                  );
                  const primaryUser = state.users.find(
                    (u) => u.id === (asgn?.assigneeUserId || item.accountableOwnerId)
                  );

                  // Calculate total tracked effort across all work sessions for this item
                  const itemSessions = state.workSessions.filter((ws) => ws.contentItemId === item.id);
                  const totalSeconds = itemSessions.reduce((acc, ws) => acc + ws.accumulatedSeconds, 0);

                  const isOwner = primaryUser?.id === activeUserId;

                  return (
                    <tr key={item.id} className="hover:bg-[#f5f5f7]/50 transition">
                      {/* Deliverable & Platform */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#1d1d1f] hover:text-[#0071e3] transition">
                          <Link href={`/projects/${projectId}/content/${item.id}`}>{item.title}</Link>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#86868b] mt-0.5">
                          <span className="font-medium text-[#1d1d1f]">{item.platform}</span>
                          <span>•</span>
                          <span>{item.contentType}</span>
                          {item.contentType === "trial_reel" && (
                            <span className="rounded bg-[#f2f2f7] px-1 text-[#0066cc] font-bold">
                              Trial
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Scope Classification */}
                      <td className="px-4 py-3">
                        {item.scopeClassification === "goodwill" ? (
                          <span className="inline-flex items-center rounded-full bg-[#eaf6ed] px-2.5 py-0.5 text-[11px] font-semibold text-[#1f6f32] border border-[#ceead6]">
                            Goodwill Extra
                          </span>
                        ) : item.scopeClassification === "additional_billable" ? (
                          <span className="inline-flex items-center rounded-full bg-[#f0f7ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#0071e3] border border-[#d0e5ff]">
                            Additional Billable
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
                            Contracted Scope
                          </span>
                        )}
                      </td>

                      {/* Primary Designer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                            {primaryUser?.avatar || "U"}
                          </div>
                          <div>
                            <div className="font-medium text-[#1d1d1f]">
                              {primaryUser?.name || "Unassigned"}
                            </div>
                            {isOwner && (
                              <span className="text-[10px] text-[#0071e3] font-bold">
                                (Assigned to You)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Assignment Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize border ${
                            asgn?.status === "completed"
                              ? "bg-[#eaf6ed] text-[#1f6f32] border-[#ceead6]"
                              : asgn?.status === "submitted"
                              ? "bg-[#eaf4ff] text-[#0066cc] border-[#b8daff]"
                              : asgn?.status === "in_progress"
                              ? "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]"
                              : asgn?.status === "accepted"
                              ? "bg-[#f0f7ff] text-[#0071e3] border-[#d0e5ff]"
                              : "bg-[#f2f2f7] text-[#6e6e73] border-black/[0.06]"
                          }`}
                        >
                          {asgn?.status?.replace(/_/g, " ") || "Assigned"}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td className="px-4 py-3 text-[#6e6e73]">
                        {formatDate(asgn?.currentDueAt || item.deadlines.submissionDeadline)}
                      </td>

                      {/* Tracked Effort */}
                      <td className="px-4 py-3 font-mono font-medium text-[#1d1d1f]">
                        {formatDurationHuman(totalSeconds)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/projects/${projectId}/content/${item.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3 py-1 text-[12px] font-medium text-[#0066cc] transition"
                        >
                          Workspace <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Update Objective Progress Modal (Management Only) */}
      {isObjectiveModalOpen && isManagement && objective && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Update Objective Progress</h3>
              <button
                onClick={() => setIsObjectiveModalOpen(false)}
                className="rounded-full p-1 text-[#86868b] hover:text-[#1d1d1f]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleObjectiveUpdate} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Objective Goal
                </label>
                <div className="font-semibold text-[#1d1d1f] text-[14px]">{objective.objectiveName}</div>
                <div className="text-[12px] text-[#6e6e73]">
                  Metric: {objective.metricName} (Target: {objective.targetValue.toLocaleString()} {objective.unit || ""})
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  New Current Attained Value ({objective.unit || "units"}) *
                </label>
                <input
                  type="number"
                  value={newObjectiveValue}
                  onChange={(e) => setNewObjectiveValue(Number(e.target.value))}
                  min={0}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsObjectiveModalOpen(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
                >
                  Save Progress
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
