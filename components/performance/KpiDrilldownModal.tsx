"use client";

import React from "react";
import {
  X,
  Clock,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Calendar,
  User,
  Folder,
  Layers,
  Sparkles,
} from "lucide-react";
import { ContentItem, WorkSession, ChangeRequest } from "@/lib/types";

export type DrilldownType =
  | "actual_hours"
  | "overdue_tasks"
  | "adhoc_hours"
  | "rework_evidence"
  | "completed_tasks"
  | "commitments_progress";

interface KpiDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  type: DrilldownType;
  items?: ContentItem[];
  workSessions?: WorkSession[];
  changeRequests?: ChangeRequest[];
  extraData?: any;
}

export function KpiDrilldownModal({
  isOpen,
  onClose,
  title,
  subtitle,
  type,
  items = [],
  workSessions = [],
  changeRequests = [],
  extraData,
}: KpiDrilldownModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-black/[0.08] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-black/[0.06] bg-[#fbfbfd]">
          <div>
            <h3 className="text-lg font-bold text-[#1d1d1f]">{title}</h3>
            {subtitle && <p className="text-xs text-[#86868b] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/[0.05] text-[#86868b] hover:text-[#1d1d1f] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {/* 1. Actual Hours Drilldown */}
          {type === "actual_hours" && (
            <div>
              {workSessions.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#86868b]">No work sessions recorded in this period.</div>
              ) : (
                <div className="space-y-2">
                  {workSessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-3 bg-[#f5f5f7] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#1d1d1f]">Session #{session.id.slice(0, 8)}</div>
                        <div className="text-[11px] text-[#86868b] mt-0.5">
                          Started: {new Date(session.startedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#0071e3] text-sm">
                          {(session.accumulatedSeconds / 3600).toFixed(2)}h
                        </div>
                        <span className="text-[10px] uppercase font-semibold text-[#86868b]">{session.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Overdue Tasks Drilldown */}
          {type === "overdue_tasks" && (
            <div>
              {items.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#86868b]">Zero overdue tasks! All work is on track.</div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-[#ff3b30]/5 border border-[#ff3b30]/15 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#1d1d1f]">{item.title}</div>
                        <div className="text-[11px] text-[#86868b] mt-0.5">
                          {item.workType || item.contentType} • {item.platform}
                        </div>
                        <div className="text-[11px] text-[#ff3b30] font-medium mt-1">
                          Deadline: {item.finalInternalDeadline ? new Date(item.finalInternalDeadline).toLocaleDateString() : "Past Due"}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-[#ff3b30]/10 text-[#d70015] rounded-full text-[10px] font-semibold">
                        Overdue
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. Ad-Hoc Hours Drilldown */}
          {type === "adhoc_hours" && (
            <div>
              {items.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#86868b]">No ad-hoc / unplanned tasks in this period.</div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-[#f5f5f7] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#1d1d1f]">{item.title}</div>
                        <div className="text-[11px] text-[#86868b] mt-0.5">
                          {item.topic || "Ad-Hoc Request"} • Scope: {item.scopeClassification}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-[#1d1d1f]">
                          {item.finalPlannedSeconds ? `${(item.finalPlannedSeconds / 3600).toFixed(2)}h` : "1.50h"}
                        </span>
                        <div className="text-[10px] text-[#ff9500] font-semibold">Ad-Hoc</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Rework & Change Requests Drilldown */}
          {type === "rework_evidence" && (
            <div>
              {changeRequests.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#86868b]">No change requests or rework logged in this period.</div>
              ) : (
                <div className="space-y-2">
                  {changeRequests.map((cr) => (
                    <div
                      key={cr.id}
                      className="p-3.5 bg-[#f5f5f7] rounded-xl text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#1d1d1f] capitalize">{cr.component} Revision</span>
                        <span className="px-2 py-0.5 bg-[#ff9500]/10 text-[#c97800] rounded-full text-[10px] font-semibold uppercase">
                          {cr.priority}
                        </span>
                      </div>
                      <p className="text-xs text-[#3a3a3c] bg-white p-2 rounded-lg border border-black/[0.04]">
                        "{cr.requestedChange}"
                      </p>
                      <div className="text-[10px] text-[#86868b]">
                        Logged: {new Date(cr.createdAt).toLocaleDateString()} • Status: {cr.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. Completed Tasks Drilldown */}
          {type === "completed_tasks" && (
            <div>
              {items.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#86868b]">No completed tasks in this period.</div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-[#f5f5f7] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#1d1d1f]">{item.title}</div>
                        <div className="text-[11px] text-[#86868b] mt-0.5">
                          {item.workType || item.contentType} • Completed: {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : (item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Yes")}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-[#34c759]/10 text-[#248a3d] rounded-full text-[10px] font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Completed
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-black/[0.06] bg-[#fbfbfd] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1d1d1f] text-white rounded-full text-xs font-medium hover:bg-black transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
