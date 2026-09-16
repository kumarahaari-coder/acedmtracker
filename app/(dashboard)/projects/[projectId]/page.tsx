"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Trash2,
} from "lucide-react";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { formatDate, formatDurationHuman } from "@/lib/formatters";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ContentPlatform, ContentType, ScopeClassification } from "@/lib/types";
import { DeleteDeliverableModal } from "@/components/content/DeleteDeliverableModal";
import { getAuthoritativeProjectDashboardAction, ProjectDashboardDTO } from "@/lib/actions/projectDashboard";

export default function ProjectDashboardPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "";
  const { state, updateProjectObjective } = useAppState();
  const { activeRole, activeUserId, canApprove } = useRole();

  const [dashboardData, setDashboardData] = useState<ProjectDashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await getAuthoritativeProjectDashboardAction(projectId, activeUserId);
      if (res.success && res.data) {
        setDashboardData(res.data);
      }
    } catch (err) {
      console.error("[ProjectDashboardPage] Error loading authoritative dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, activeUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isManagement = dashboardData?.isManagement ?? (activeRole === "founder" || activeRole === "consultant" || activeRole === "admin");

  const project = dashboardData?.project || state.projects.find((p) => p.id === projectId);
  if (loading && !project) {
    return (
      <div className="p-8 sm:p-10 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0071e3] border-t-transparent mx-auto" />
          <p className="text-[13px] text-[#86868b]">Loading authoritative project data...</p>
        </div>
      </div>
    );
  }
  if (!project) return null;

  const projectMembers = dashboardData?.members && dashboardData.members.length > 0
    ? dashboardData.members
    : state.projectMemberships
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
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);

  const metrics = dashboardData?.metrics;
  const assignedWork = dashboardData?.assignedWork || [];

  // Filtered Deliverables list for Assigned-Work view (Invariant 5 & 6)
  const filteredDeliverables = assignedWork.filter((item) => {
    if (filterDesigner !== "all" && item.primaryOwnerId !== filterDesigner) return false;
    if (filterStatus !== "all" && item.assignmentStatus !== filterStatus) return false;
    if (filterScope !== "all" && item.scopeClassification !== filterScope) return false;
    if (filterPlatform !== "all" && item.platform !== filterPlatform) return false;
    return true;
  });

  // Deliverable-Based Metrics
  const targetReq = project.targetRequirements || { posts: 0, carousels: 0, reels: 0, trialReels: 0 };
  const totalContractedTarget =
    (targetReq.posts || 0) +
    (targetReq.carousels || 0) +
    (targetReq.reels || 0) +
    (targetReq.trialReels || 0);

  const deliverableCompletionPercentage = metrics?.deliverableCompletionPercentage ?? (
    totalContractedTarget > 0
      ? Math.min(100, Math.round(((metrics?.completedContractedCount || 0) / totalContractedTarget) * 100))
      : 0
  );

  // Objective-Based Metrics
  const isObjectiveModel = project.engagementModel === "objective_based";
  const objective = project.objectiveConfig;
  const objectivePercentage = metrics?.objectivePercentage ?? (
    objective && objective.targetValue > 0
      ? Math.min(100, Math.round((Number(objective.currentValue || 0) / Number(objective.targetValue)) * 100))
      : 0
  );

  const handleObjectiveUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateProjectObjective({
      projectId,
      updates: { currentValue: Number(newObjectiveValue) },
      actorUserId: activeUserId,
    });
    setIsObjectiveModalOpen(false);
  };

  const isUiDesign = project.projectType === "ui_design";

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Apple-style Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#0066cc]">
            <span>{project.clientBrand}</span>
            <span>•</span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isUiDesign ? "bg-[#f3e8ff] text-[#7e22ce]" : "bg-[#eaf4ff] text-[#0071e3]"
              }`}
            >
              {isUiDesign ? "UI Design" : "Digital Marketing"}
            </span>
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
          {project.masterFigmaUrl && (
            <a
              href={project.masterFigmaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-[#f3e8ff] border border-[#d8b4fe] hover:bg-[#ede9fe] px-4 py-2 text-[13px] font-medium text-[#7e22ce] shadow-xs transition"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Master Figma
            </a>
          )}
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
              {metrics?.completedContractedCount || 0} <span className="text-[18px] text-[#86868b] font-normal">/ {totalContractedTarget}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#f2f2f7] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0071e3] transition-all duration-300"
                style={{ width: `${deliverableCompletionPercentage}%` }}
              />
            </div>
            <div className="text-[11px] text-[#86868b]">
              Agreed: {project.targetRequirements?.posts || 0}p, {project.targetRequirements?.carousels || 0}c, {project.targetRequirements?.reels || 0}r
            </div>
          </div>

          {/* Goodwill & Extra Output */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6e6e73]">Value-Add / Goodwill</span>
              <span className="text-[11px] font-bold status-approved px-2 py-0.5 rounded-full">Delivered</span>
            </div>
            <div className="text-[32px] font-bold text-[#1f6f32] tracking-tight">
              {metrics?.completedGoodwillCount || 0} <span className="text-[14px] text-[#86868b] font-medium">Goodwill Items</span>
            </div>
            <div className="text-[12px] text-[#6e6e73]">
              + {metrics?.completedAdditionalCount || 0} additional billables delivered
            </div>
          </div>

          {/* Overdue / Approvals in Queue */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6e6e73]">Awaiting Review</span>
              <CheckCircle2 className="h-4 w-4 text-[#9a6700]" />
            </div>
            <div className="text-[32px] font-bold text-[#9a6700] tracking-tight">
              {metrics?.inReviewCount || 0}
            </div>
            <div className="text-[12px] text-[#86868b]">
              {(metrics?.overdueCount || 0) > 0 ? (
                <span className="text-[#d70015] font-semibold">{metrics?.overdueCount} deliverable(s) overdue</span>
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
              {metrics?.totalPipeline || 0} <span className="text-[14px] text-[#86868b] font-normal">items</span>
            </div>
            <div className="text-[12px] text-[#86868b]">
              {metrics?.publishedCount || 0} published • {metrics?.scheduledCount || 0} scheduled
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
              Showing: {filteredDeliverables.length} of {assignedWork.length}
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
                <th className="px-4 py-3">{isUiDesign ? "Design Task & Screen" : "Deliverable & Platform"}</th>
                <th className="px-4 py-3">Scope Classification</th>
                <th className="px-4 py-3">Primary Designer</th>
                <th className="px-4 py-3">Assignment Status</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Effort</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {filteredDeliverables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#86868b]">
                    {isUiDesign ? "No design tasks match the selected filter criteria." : "No deliverables match the selected filter criteria."}
                  </td>
                </tr>
              ) : (
                filteredDeliverables.map((item) => {
                  const isOwner = item.isAssignedToCurrentUser;

                  return (
                    <tr key={item.id} className="hover:bg-[#f5f5f7]/50 transition">
                      {/* Deliverable & Platform / Design Task & Screen */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#1d1d1f] hover:text-[#0071e3] transition">
                          <Link href={`/projects/${projectId}/content/${item.id}`}>{item.title}</Link>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#86868b] mt-0.5">
                          {isUiDesign ? (
                            <>
                              <span className="font-medium text-[#7e22ce]">UI Design</span>
                              <span>•</span>
                              <span>{item.workType || "Screen"}</span>
                              {item.figmaUrl && (
                                <>
                                  <span>•</span>
                                  <a
                                    href={item.figmaUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#7e22ce] hover:underline flex items-center gap-0.5"
                                  >
                                    Figma ↗
                                  </a>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-medium text-[#1d1d1f]">{item.platform}</span>
                              <span>•</span>
                              <span>{item.contentType}</span>
                              {item.contentType === "trial_reel" && (
                                <span className="rounded bg-[#f2f2f7] px-1 text-[#0066cc] font-bold">
                                  Trial
                                </span>
                              )}
                            </>
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
                          <UserAvatar
                            avatar={item.primaryOwnerAvatar}
                            name={item.primaryOwnerName}
                            className="h-6 w-6 text-[10px]"
                            fallbackClassName="bg-[#1d1d1f] text-white"
                          />
                          <div>
                            <div className="font-medium text-[#1d1d1f]">
                              {item.primaryOwnerName || "Unassigned"}
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
                            item.assignmentStatus === "completed"
                              ? "bg-[#eaf6ed] text-[#1f6f32] border-[#ceead6]"
                              : item.assignmentStatus === "submitted"
                              ? "bg-[#eaf4ff] text-[#0066cc] border-[#b8daff]"
                              : item.assignmentStatus === "in_progress"
                              ? "bg-[#fff8e6] text-[#9a6700] border-[#ffe082]"
                              : item.assignmentStatus === "accepted"
                              ? "bg-[#f0f7ff] text-[#0071e3] border-[#d0e5ff]"
                              : "bg-[#f2f2f7] text-[#6e6e73] border-black/[0.06]"
                          }`}
                        >
                          {item.assignmentStatus?.replace(/_/g, " ") || "Assigned"}
                        </span>
                      </td>

                      {/* Due Date (Authoritative Operational Deadline) */}
                      <td className="px-4 py-3 text-[#6e6e73]">
                        <div>{formatDate(item.operationalDeadline)}</div>
                        {isUiDesign && item.clientDeliveryDate && (
                          <div className="text-[11px] text-[#7e22ce] font-medium">
                            Client: {formatDate(item.clientDeliveryDate)}
                          </div>
                        )}
                      </td>

                      {/* Effort */}
                      <td className="px-4 py-3 font-mono text-[12px]">
                        <div className="font-semibold text-[#1d1d1f]">
                          {item.plannedEffortSeconds
                            ? `${(item.plannedEffortSeconds / 3600).toFixed(2).replace(/\.00$/, "")}h planned`
                            : "Unset planned"}
                        </div>
                        <div className="text-[11px] text-[#86868b]">
                          {formatDurationHuman(item.totalTrackedSeconds)} tracked
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <Link
                            href={`/projects/${projectId}/content/${item.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3 py-1 text-[12px] font-medium text-[#0066cc] transition"
                          >
                            Workspace <ArrowRight className="h-3 w-3" />
                          </Link>
                          {isManagement && (
                            <button
                              onClick={() => setItemToDelete(item)}
                              className="p-1.5 rounded-full text-[#86868b] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                              title="Delete Deliverable"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
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

      {/* Delete Deliverable Modal */}
      {itemToDelete && (
        <DeleteDeliverableModal
          isOpen={Boolean(itemToDelete)}
          onClose={() => setItemToDelete(null)}
          item={{
            id: itemToDelete.id,
            title: itemToDelete.title,
            platform: itemToDelete.platform,
            contentGroupId: itemToDelete.contentGroupId,
            stage: itemToDelete.stage,
          }}
          hasSiblings={false}
          onDeleted={() => {
            setItemToDelete(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
