"use client";

import React from "react";
import Link from "next/link";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { getItemApprovalMatrixSummary } from "@/lib/derived";
import { formatDate } from "@/lib/formatters";

export default function MyWorkDashboardPage() {
  const { state } = useAppState();
  const { activeRole, activeUserId, canApprove, setActiveProjectId } = useRole();

  // Get active user's assigned projects
  const accessibleProjectIds = new Set(
    activeRole === "admin" || activeRole === "founder"
      ? state.projects.map((p) => p.id)
      : state.projectMemberships
          .filter((m) => m.userId === activeUserId && m.status === "active")
          .map((m) => m.projectId)
  );

  // Items across accessible projects
  const accessibleItems = state.contentItems.filter((i) => accessibleProjectIds.has(i.projectId));

  // My assigned items
  const myAssignedItems = accessibleItems.filter(
    (i) => i.accountableOwnerId === activeUserId || i.collaboratorIds.includes(activeUserId)
  );

  // Approvals awaiting my decision (if founder or consultant)
  const itemsNeedingReview = accessibleItems.filter((i) => {
    if (i.stage !== "in_review" && i.stage !== "submitted") return false;
    const version = state.submissionVersions.find(
      (v) => v.id === i.latestSubmittedVersionId || v.id === i.activeDraftVersionId
    );
    const summary = getItemApprovalMatrixSummary(
      i,
      version,
      state.approvalDecisions,
      state.founderOverrides
    );
    if (activeRole === "founder") {
      return summary.copy.founder === "pending" || summary.creative.founder === "pending" || summary.posting_date.founder === "pending";
    }
    if (activeRole === "consultant") {
      return summary.copy.consultant === "pending" || summary.creative.consultant === "pending" || summary.posting_date.consultant === "pending";
    }
    return false;
  });

  // Open change requests needing designer response
  const openChangeRequests = state.changeRequests.filter(
    (cr) =>
      accessibleProjectIds.has(cr.projectId) &&
      cr.status === "open" &&
      (activeRole === "designer" || activeRole === "founder" || activeRole === "consultant")
  );

  // Overdue / approaching deadlines
  const now = new Date();
  const urgentItems = accessibleItems.filter((i) => {
    if (i.stage === "published" || i.stage === "approved") return false;
    const deadline = i.deadlines.resubmissionDeadline || i.deadlines.submissionDeadline;
    if (!deadline) return false;
    const dueTime = new Date(deadline).getTime();
    // Overdue or due within next 48 hours
    return dueTime < now.getTime() + 48 * 3600 * 1000;
  });

  return (
    <div className="flex-1 p-8 sm:p-10 max-w-7xl mx-auto w-full space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <Briefcase className="h-7 w-7 text-[#0071e3]" />
            <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight text-[#1d1d1f]">
              Cross-Project My Work
            </h1>
          </div>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Personalized operational work queue across all accessible workspace projects.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="flex items-center gap-2 rounded-full bg-[#ffffff] hover:bg-[#f5f5f7] text-[#1d1d1f] border border-black/[0.08] px-4 py-2 text-[13px] font-medium transition shadow-sm"
          >
            <Layers className="h-4 w-4 text-[#0071e3]" /> View Project Portfolio
          </Link>
        </div>
      </div>

      {/* Cross-Project Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Assigned To Me</div>
          <div className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">{myAssignedItems.length}</div>
          <div className="text-[12px] text-[#86868b]">Deliverables under your ownership</div>
        </div>

        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Awaiting My Review</div>
          <div className="text-[32px] font-bold text-[#9a6700] tracking-tight">{itemsNeedingReview.length}</div>
          <div className="text-[12px] text-[#86868b]">Pending your component decisions</div>
        </div>

        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Open Change Requests</div>
          <div className="text-[32px] font-bold text-[#d70015] tracking-tight">{openChangeRequests.length}</div>
          <div className="text-[12px] text-[#86868b]">Requires Designer response</div>
        </div>

        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] font-medium text-[#6e6e73]">Due Soon / Overdue</div>
          <div className="text-[32px] font-bold text-[#0071e3] tracking-tight">{urgentItems.length}</div>
          <div className="text-[12px] text-[#86868b]">Deadlines within 48 hours</div>
        </div>
      </div>

      {/* 2-Column Work Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approvals Requiring Action (Founder / Consultant) */}
        {canApprove && (
          <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#9a6700]" />
                <h3 className="font-semibold text-[#1d1d1f] text-[16px]">Items Awaiting Your Approval</h3>
              </div>
              <span className="text-[12px] font-bold status-review rounded-full px-2.5 py-0.5">
                {itemsNeedingReview.length} Items
              </span>
            </div>

            <div className="space-y-3">
              {itemsNeedingReview.length === 0 ? (
                <div className="py-10 text-center text-[13px] text-[#86868b]">
                  You have no pending items waiting for your approval.
                </div>
              ) : (
                itemsNeedingReview.map((item) => {
                  const proj = state.projects.find((p) => p.id === item.projectId);
                  return (
                    <Link
                      key={item.id}
                      href={`/projects/${item.projectId}/content/${item.id}`}
                      onClick={() => setActiveProjectId(item.projectId)}
                      className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#0071e3]/50 hover:bg-[#f5f5f7] transition space-y-1.5 group"
                    >
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                        <span className="text-[#86868b]">{item.platform} • {item.contentType}</span>
                      </div>
                      <div className="font-semibold text-[14px] text-[#1d1d1f] group-hover:text-[#0066cc] transition truncate">
                        {item.title}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Change Requests Requiring Action (Designer) */}
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#d70015]" />
              <h3 className="font-semibold text-[#1d1d1f] text-[16px]">Open Change Requests</h3>
            </div>
            <span className="text-[12px] font-bold status-changes rounded-full px-2.5 py-0.5">
              {openChangeRequests.length} Open
            </span>
          </div>

          <div className="space-y-3">
            {openChangeRequests.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#86868b]">
                No open change requests across your projects.
              </div>
            ) : (
              openChangeRequests.map((cr) => {
                const item = state.contentItems.find((i) => i.id === cr.contentItemId);
                const proj = state.projects.find((p) => p.id === cr.projectId);
                return (
                  <Link
                    key={cr.id}
                    href={`/projects/${cr.projectId}/content/${cr.contentItemId}`}
                    onClick={() => setActiveProjectId(cr.projectId)}
                    className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#d70015]/50 hover:bg-[#f5f5f7] transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                      <span className="status-changes rounded-full px-2 py-0.2 font-bold text-[11px] uppercase">
                        {cr.component}
                      </span>
                    </div>
                    <div className="font-semibold text-[14px] text-[#1d1d1f] truncate">{item?.title}</div>
                    <p className="text-[13px] text-[#6e6e73] line-clamp-1 italic">"{cr.requestedChange}"</p>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Assigned Deliverables */}
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#0071e3]" />
              <h3 className="font-semibold text-[#1d1d1f] text-[16px]">My Active Assignments</h3>
            </div>
            <span className="text-[12px] font-medium rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[#1d1d1f]">
              {myAssignedItems.length} Items
            </span>
          </div>

          <div className="space-y-3">
            {myAssignedItems.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#86868b]">
                No items directly assigned to you at this time.
              </div>
            ) : (
              myAssignedItems.map((item) => {
                const proj = state.projects.find((p) => p.id === item.projectId);
                return (
                  <Link
                    key={item.id}
                    href={`/projects/${item.projectId}/content/${item.id}`}
                    onClick={() => setActiveProjectId(item.projectId)}
                    className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#0071e3]/50 hover:bg-[#f5f5f7] transition space-y-1 group"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                      <span className="text-[#86868b] capitalize">{item.stage.replace("_", " ")}</span>
                    </div>
                    <div className="font-semibold text-[14px] text-[#1d1d1f] group-hover:text-[#0066cc] transition truncate">
                      {item.title}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Deadlines within 48 Hours */}
        <div className="rounded-[20px] border border-black/[0.08] bg-[#ffffff] p-6 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#0071e3]" />
              <h3 className="font-semibold text-[#1d1d1f] text-[16px]">Approaching Deadlines</h3>
            </div>
            <span className="text-[12px] font-bold status-review rounded-full px-2.5 py-0.5">
              {urgentItems.length} Urgent
            </span>
          </div>

          <div className="space-y-3">
            {urgentItems.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#86868b]">
                No approaching deadlines within 48 hours.
              </div>
            ) : (
              urgentItems.map((item) => {
                const proj = state.projects.find((p) => p.id === item.projectId);
                const deadline = item.deadlines.resubmissionDeadline || item.deadlines.submissionDeadline;
                return (
                  <Link
                    key={item.id}
                    href={`/projects/${item.projectId}/content/${item.id}`}
                    onClick={() => setActiveProjectId(item.projectId)}
                    className="block p-4 rounded-xl bg-[#fbfbfd] border border-black/[0.06] hover:border-[#0071e3]/50 hover:bg-[#f5f5f7] transition space-y-1 group"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#0066cc]">{proj?.name}</span>
                      <span className="text-[#9a6700] font-bold">
                        {formatDate(deadline)}
                      </span>
                    </div>
                    <div className="font-semibold text-[14px] text-[#1d1d1f] group-hover:text-[#0066cc] transition truncate">
                      {item.title}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
