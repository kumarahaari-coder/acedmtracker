"use client";

import React from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { AlertCircle, Bell, Check, Clock, X } from "lucide-react";
import { formatTime } from "@/lib/formatters";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const { state, markNotificationRead } = useAppState();
  const { activeProjectId, activeRole } = useRole();

  if (!isOpen) return null;

  const notifs = state.notifications.filter(
    (n) => n.projectId === activeProjectId || activeRole === "founder" || activeRole === "admin"
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-white border-l border-black/[0.08] p-6 flex flex-col justify-between shadow-2xl h-full animate-in slide-in-from-right">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-[#0071e3]" />
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Notifications & Reminders</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-10rem)] pr-1">
            {notifs.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-[#86868b]">
                No active notifications.
              </div>
            ) : (
              notifs.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 rounded-2xl border text-[13px] space-y-1.5 transition ${
                    n.readAt
                      ? "bg-[#ffffff] border-black/[0.06] text-[#6e6e73]"
                      : "bg-[#fbfbfd] border-black/[0.12] text-[#1d1d1f] shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        n.eventType === "overdue_escalation_4h"
                          ? "status-changes"
                          : n.eventType === "changes_requested"
                          ? "status-review"
                          : "bg-[#f2f2f7] text-[#1d1d1f]"
                      }`}
                    >
                      {n.eventType.replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] text-[#86868b]">
                      {formatTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium leading-relaxed">{n.message}</p>
                  {!n.readAt && (
                    <button
                      onClick={() => markNotificationRead(n.id)}
                      className="text-[12px] font-medium text-[#0066cc] hover:text-[#0077ed] transition"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-black/[0.06]">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] py-2 text-[13px] font-medium text-[#1d1d1f] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
