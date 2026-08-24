"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { History, ShieldAlert, Lock, ArrowLeft, Filter, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import { getAuthoritativeAuditHistory } from "@/lib/derived";

export default function AuditLogPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const [filterAction, setFilterAction] = useState<string>("all");

  // Query audit history authoritatively with strict server-side role & membership gate
  const auditResult = getAuthoritativeAuditHistory(state, projectId, activeUserId, activeRole);

  // 403 Forbidden Access Restricted State for Unauthorized Roles (Designer, Client, External)
  if (auditResult.status === 403 || auditResult.isRestricted) {
    return (
      <div className="p-8 sm:p-12 max-w-4xl mx-auto space-y-6 animate-in fade-in">
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-3xl p-8 sm:p-10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-center space-y-5">
          <div className="h-16 w-16 rounded-full bg-[#fff0ee] text-[#b42318] flex items-center justify-center mx-auto border border-[#ffd5d0] shadow-sm">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff0ee] text-[#b42318] text-[12px] font-bold uppercase tracking-wider">
              403 Forbidden
            </div>
            <h1 className="text-[26px] sm:text-[30px] font-bold text-[#1d1d1f] tracking-tight">
              Internal Audit History Restricted
            </h1>
            <p className="text-[14px] text-[#6e6e73] max-w-lg mx-auto leading-relaxed">
              Full immutable security audit ledgers, attendance corrections, override justifications, and administrative event histories are strictly accessible only to authorized agency management (Founder, Consultant, and Admin).
            </p>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] hover:bg-[#2d2d2f] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition"
            >
              <ArrowLeft className="h-4 w-4" /> Return to Deliverables
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const allRecords = auditResult.data || [];
  const filteredRecords = allRecords.filter((a) => {
    if (filterAction === "all") return true;
    return a.action === filterAction || a.action.startsWith(filterAction);
  });

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-[#0071e3]" />
            <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
              Audit History &amp; Security Ledger
            </h1>
          </div>
          <p className="text-[14px] text-[#6e6e73] mt-0.5">
            Authoritative append-only audit trail capturing security events, approvals, overrides, and administrative adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#ffffff] border border-black/[0.08] rounded-full px-3.5 py-1.5 text-[13px] shadow-sm">
          <Filter className="h-3.5 w-3.5 text-[#86868b]" />
          <span className="text-[12px] text-[#86868b] font-medium">Filter Events:</span>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-transparent text-[#1d1d1f] font-semibold focus:outline-none text-[13px]"
          >
            <option value="all">All Events ({allRecords.length})</option>
            <option value="approval">Approvals &amp; Overrides</option>
            <option value="submit">Submissions &amp; Revisions</option>
            <option value="deadline">Deadlines &amp; Assignments</option>
            <option value="publish">Publications &amp; Live URLs</option>
            <option value="attendance">Attendance &amp; Presence</option>
            <option value="work_session">Work Timer Adjustments</option>
            <option value="project_member">Team &amp; Memberships</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-[#1d1d1f]">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] text-[12px] font-semibold border-b border-black/[0.08]">
              <tr>
                <th className="p-4 pl-6">Timestamp (IST)</th>
                <th className="p-4">Actor</th>
                <th className="p-4">Security Action</th>
                <th className="p-4">Audit Summary</th>
                <th className="p-4 pr-6">Mandatory Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[13px] text-[#86868b]">
                    No audit records matching criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-[#f5f5f7]/60 transition">
                    <td className="p-4 pl-6 font-mono text-[12px] text-[#6e6e73] whitespace-nowrap">
                      {formatDateTime(record.timestamp)}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="font-semibold text-[#1d1d1f]">{record.actorName}</div>
                      <div className="text-[11px] text-[#86868b] capitalize">{record.actorRole}</div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="rounded-full bg-[#f2f2f7] px-2.5 py-0.5 text-[11px] font-mono text-[#1d1d1f] border border-black/[0.04]">
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
