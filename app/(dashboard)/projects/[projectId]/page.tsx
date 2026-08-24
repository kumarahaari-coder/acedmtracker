"use client";

import React from "react";
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
  Layers,
  Sparkles,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { getItemApprovalMatrixSummary } from "@/lib/derived";

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state } = useAppState();
  const { canApprove } = useRole();

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;

  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  const projectMembers = state.projectMemberships.filter((m) => m.projectId === projectId);

  // Deliverables by stage
  const publishedItems = projectItems.filter((i) => i.stage === "published");
  const inReviewItems = projectItems.filter((i) => i.stage === "in_review" || i.stage === "submitted");
  const changesReqItems = projectItems.filter((i) => i.stage === "changes_requested");
  const scheduledItems = projectItems.filter((i) => i.stage === "scheduled");

  // Target metrics calculation
  const totalTarget =
    project.targetRequirements.posts +
    project.targetRequirements.carousels +
    project.targetRequirements.reels +
    project.targetRequirements.trialReels;

  const completionPercentage =
    totalTarget > 0 ? Math.min(100, Math.round((publishedItems.length / totalTarget) * 100)) : 0;

  // Widget 2: Overdue / Escalated Items (overdue > 4h)
  const now = new Date();
  const overdueItems = projectItems.filter((i) => {
    if (i.stage === "published" || i.stage === "approved") return false;
    const deadline = i.deadlines.resubmissionDeadline || i.deadlines.submissionDeadline;
    if (!deadline) return false;
    return new Date(deadline).getTime() < now.getTime();
  });

  // Widget 5: Top Performing Content
  const projectSnapshots = state.analyticsSnapshots.filter((s) => s.projectId === projectId);
  const topSnapshot = [...projectSnapshots].sort((a, b) => b.reach - a.reach)[0];
  const topContentItem = topSnapshot
    ? projectItems.find((i) => i.id === topSnapshot.contentItemId)
    : publishedItems[0];

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-8">
      {/* Apple-style Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#0066cc]">
            <span>{project.clientBrand}</span>
            <span>•</span>
            <span>{project.timezone}</span>
          </div>
          <h1 className="text-[32px] sm:text-[40px] font-bold text-[#1d1d1f] tracking-tight leading-tight">
            {project.name}
          </h1>
          <p className="text-[15px] text-[#6e6e73] font-normal max-w-3xl">
            {project.scope}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}/calendar`}
            className="flex items-center gap-1.5 rounded-full bg-[#e8e8ed] hover:bg-[#dcdce2] px-4 py-2 text-[13px] font-medium text-[#1d1d1f] transition"
          >
            <Calendar className="h-4 w-4 text-[#1d1d1f]" /> View Calendar
          </Link>
          <Link
            href={`/projects/${projectId}/kanban`}
            className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-5 py-2 text-[13px] font-medium text-white shadow-sm transition"
          >
            Open Kanban Board <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* 5 Founder / Consultant Core Executive Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Widget 1: Target Completion */}
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#6e6e73]">Quarterly Progress</span>
            <span className="text-[13px] font-semibold text-[#0071e3]">{completionPercentage}%</span>
          </div>
          <div className="text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            {publishedItems.length} <span className="text-[18px] text-[#86868b] font-normal">/ {totalTarget}</span>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-[#f2f2f7] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0071e3] transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <div className="text-[12px] text-[#86868b]">
              Target: {project.targetRequirements.posts} posts, {project.targetRequirements.carousels} carousels, {project.targetRequirements.reels} reels
            </div>
          </div>
        </div>

        {/* Widget 2: Overdue / Escalation Alert */}
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#6e6e73]">Overdue Escalation</span>
            <AlertTriangle className={`h-4 w-4 ${overdueItems.length > 0 ? "text-[#d70015]" : "text-[#86868b]"}`} />
          </div>
          <div className="text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            {overdueItems.length}
          </div>
          <div className="text-[12px] text-[#86868b]">
            {overdueItems.length > 0
              ? `${overdueItems.length} deliverable(s) past 4-hour escalation window`
              : "All deliverables currently on schedule"}
          </div>
        </div>

        {/* Widget 3: Approvals Queue */}
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#6e6e73]">Awaiting Decisions</span>
            <CheckCircle2 className="h-4 w-4 text-[#9a6700]" />
          </div>
          <div className="text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            {inReviewItems.length}
          </div>
          <div className="text-[12px] text-[#86868b]">
            {inReviewItems.length} item(s) pending 3-component review
          </div>
        </div>

        {/* Widget 4: Scheduled Publishing */}
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#6e6e73]">Upcoming Scheduled</span>
            <Clock className="h-4 w-4 text-[#0071e3]" />
          </div>
          <div className="text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            {scheduledItems.length}
          </div>
          <div className="text-[12px] text-[#86868b]">
            Approved & queued for release
          </div>
        </div>
      </div>

      {/* 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column (8 cols): Content Pipeline & Stage Funnel */}
        <div className="lg:col-span-8 space-y-6">
          {/* Stage Funnel Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#1d1d1f] tracking-tight">
                Deliverables Funnel
              </h2>
              <span className="text-[13px] text-[#6e6e73] font-medium">
                {projectItems.length} Active Items
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-[#f5f5f7] space-y-1">
                <div className="text-[12px] text-[#6e6e73]">1. Drafting</div>
                <div className="text-[20px] font-bold text-[#1d1d1f]">
                  {projectItems.filter((i) => i.stage === "draft").length}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#fff7e0] border border-[#f2e2a8] space-y-1">
                <div className="text-[12px] text-[#8a5a00]">2. In Review</div>
                <div className="text-[20px] font-bold text-[#8a5a00]">
                  {inReviewItems.length}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#fff0ee] border border-[#ffd5d0] space-y-1">
                <div className="text-[12px] text-[#b42318]">3. Changes Req</div>
                <div className="text-[20px] font-bold text-[#b42318]">
                  {changesReqItems.length}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#eaf6ed] border border-[#c4e6cc] space-y-1">
                <div className="text-[12px] text-[#1f6f32]">4. Published</div>
                <div className="text-[20px] font-bold text-[#1f6f32]">
                  {publishedItems.length}
                </div>
              </div>
            </div>
          </div>

          {/* Active Deliverables Table */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">
                Active Project Deliverables
              </h3>
              <Link
                href={`/projects/${projectId}/approvals`}
                className="text-[13px] text-[#0066cc] hover:text-[#0077ed] font-medium"
              >
                Approvals Queue →
              </Link>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {projectItems.slice(0, 5).map((item) => {
                const latestVersion = state.submissionVersions.find(
                  (v) => v.id === item.latestSubmittedVersionId || v.id === item.activeDraftVersionId
                );
                const approvalSummary = getItemApprovalMatrixSummary(
                  item,
                  latestVersion,
                  state.approvalDecisions,
                  state.founderOverrides
                );

                return (
                  <div
                    key={item.id}
                    className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-[#f5f5f7]/60 transition"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-medium text-[#1d1d1f]">
                          {item.platform}
                        </span>
                        <Link
                          href={`/projects/${projectId}/content/${item.id}`}
                          className="font-semibold text-[14px] text-[#1d1d1f] hover:text-[#0066cc] truncate"
                        >
                          {item.title}
                        </Link>
                      </div>
                      <div className="text-[12px] text-[#86868b]">
                        Version {item.currentVersionNumber} • Assigned to {state.users.find((u) => u.id === item.accountableOwnerId)?.name || "Designer"}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {approvalSummary.allComponentsApproved ? (
                        <span className="status-approved rounded-full px-2.5 py-0.5 text-[12px] font-medium">
                          3/3 Approved
                        </span>
                      ) : approvalSummary.anyChangesRequested ? (
                        <span className="status-changes rounded-full px-2.5 py-0.5 text-[12px] font-medium">
                          Changes Req
                        </span>
                      ) : (
                        <span className="status-review rounded-full px-2.5 py-0.5 text-[12px] font-medium">
                          In Review ({approvalSummary.approvedCount}/3)
                        </span>
                      )}

                      <Link
                        href={`/projects/${projectId}/content/${item.id}`}
                        className="rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3 py-1 text-[13px] font-medium text-[#1d1d1f] transition"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Team & Top Content */}
        <div className="lg:col-span-4 space-y-6">
          {/* Top Performing Deliverable Card (Widget 5) */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Top Performing Deliverable</h3>
              <Sparkles className="h-4 w-4 text-[#9a6700]" />
            </div>

            {topContentItem ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#f5f5f7] p-3.5 space-y-1.5">
                  <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#1d1d1f] shadow-xs">
                    {topContentItem.platform}
                  </span>
                  <div className="font-semibold text-[14px] text-[#1d1d1f]">
                    {topContentItem.title}
                  </div>
                </div>

                {topSnapshot && (
                  <div className="grid grid-cols-2 gap-2 text-[13px]">
                    <div className="p-2.5 rounded-lg bg-[#fbfbfd] border border-black/[0.06]">
                      <div className="text-[11px] text-[#86868b]">Reach</div>
                      <div className="font-bold text-[#1d1d1f] text-[15px]">{topSnapshot.reach.toLocaleString()}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#fbfbfd] border border-black/[0.06]">
                      <div className="text-[11px] text-[#86868b]">Engagement</div>
                      <div className="font-bold text-[#248a3d] text-[15px]">{topSnapshot.engagementRate}%</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[13px] text-[#86868b] py-4 text-center">
                No published analytics snapshots yet.
              </div>
            )}
          </div>

          {/* Project Team Members Card */}
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Project Team</h3>
              <span className="text-[12px] text-[#86868b]">{projectMembers.length} Members</span>
            </div>

            <div className="space-y-2.5">
              {projectMembers.map((m) => {
                const user = state.users.find((u) => u.id === m.userId);
                return (
                  <div key={m.userId} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f5f5f7] transition">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f2f2f7] text-[#1d1d1f] font-semibold text-[11px]">
                        {user?.avatar || "U"}
                      </div>
                      <div>
                        <div className="font-medium text-[13px] text-[#1d1d1f]">{user?.name}</div>
                        <div className="text-[11px] text-[#86868b] capitalize">
                          {(m.membershipRole || user?.role || "designer").replace("_", " ")}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
