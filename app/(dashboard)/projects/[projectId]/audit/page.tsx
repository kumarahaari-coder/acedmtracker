"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { History } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";

export default function AuditLogPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state } = useAppState();

  const [filterAction, setFilterAction] = useState<string>("all");

  const projectAudit = state.auditRecords.filter((a) => {
    const matchesProj = a.projectId === projectId || a.projectId === "org";
    if (filterAction === "all") return matchesProj;
    return matchesProj && a.action === filterAction;
  });

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Audit History Simulation
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Simulated append-only log tracking actors, approvals, overrides, and resubmissions.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#ffffff] border border-black/[0.08] rounded-full px-3.5 py-1 text-[13px] shadow-sm">
          <span className="text-[12px] text-[#86868b] font-medium">Filter:</span>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-transparent text-[#1d1d1f] font-medium focus:outline-none text-[13px]"
          >
            <option value="all">All Events</option>
            <option value="approval_decision">Approvals & Rejections</option>
            <option value="founder_override">Founder Overrides</option>
            <option value="resubmit_version">Resubmissions</option>
            <option value="update_deadline">Deadline Adjustments</option>
            <option value="mark_published">Publications</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-[#1d1d1f]">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] text-[12px] font-semibold border-b border-black/[0.08]">
              <tr>
                <th className="p-4 pl-6">Timestamp</th>
                <th className="p-4">Actor</th>
                <th className="p-4">Event</th>
                <th className="p-4">Summary</th>
                <th className="p-4 pr-6">Mandatory Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {projectAudit.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[13px] text-[#86868b]">
                    No audit records matching criteria.
                  </td>
                </tr>
              ) : (
                projectAudit.map((record) => (
                  <tr key={record.id} className="hover:bg-[#f5f5f7]/60 transition">
                    <td className="p-4 pl-6 font-mono text-[12px] text-[#6e6e73] whitespace-nowrap">
                      {formatDateTime(record.timestamp)}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="font-semibold text-[#1d1d1f]">{record.actorName}</div>
                      <div className="text-[11px] text-[#86868b] capitalize">{record.actorRole}</div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[11px] font-mono text-[#1d1d1f]">
                        {record.action}
                      </span>
                    </td>
                    <td className="p-4 text-[#1d1d1f] max-w-md leading-relaxed">
                      {record.summary}
                    </td>
                    <td className="p-4 pr-6 text-[#6e6e73] italic text-[12px]">
                      {record.reason || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
