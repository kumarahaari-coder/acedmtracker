"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  X,
} from "lucide-react";
import { ContentItem, ContentPlatform, ContentType, DeadlineKind } from "@/lib/types";
import { formatDate } from "@/lib/formatters";

export default function CalendarPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, updateDeadline, createContentItem } = useAppState();
  const { activeRole } = useRole();

  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [dateLayer, setDateLayer] = useState<DeadlineKind>("scheduled_publication");
  const [currentDate, setCurrentDate] = useState(new Date(2026, 7, 20)); // August 20, 2026

  // Reschedule Modal
  const [selectedItemForReschedule, setSelectedItemForReschedule] = useState<ContentItem | null>(null);
  const [newDateVal, setNewDateVal] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  // Quick Create Modal
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPlatform, setQuickPlatform] = useState<ContentPlatform>("Instagram");
  const [quickType, setQuickType] = useState<ContentType>("carousel");
  const [quickDate, setQuickDate] = useState("2026-08-26");
  const [quickAssigneeId, setQuickAssigneeId] = useState("u_designer1");

  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  const projectMembers = state.projectMemberships
    .filter((m) => m.projectId === projectId)
    .map((m) => {
      const user = state.users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        role: m.role,
        name: user?.name || m.userId,
      };
    });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getItemLayerDate = (item: ContentItem): string | undefined => {
    if (dateLayer === "submission") return item.deadlines.submissionDeadline;
    if (dateLayer === "resubmission") return item.deadlines.resubmissionDeadline;
    if (dateLayer === "approval_target") return item.deadlines.approvalTarget;
    if (dateLayer === "scheduled_publication") return item.deadlines.scheduledPublicationDate;
    return item.deadlines.scheduledPublicationDate;
  };

  // Month grid
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  // Week bounds
  const currentDayOfWeek = currentDate.getDay();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDayOfWeek);

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push(d);
  }

  const handlePrev = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month - 1, 1));
    } else {
      const prevWeek = new Date(currentDate);
      prevWeek.setDate(currentDate.getDate() - 7);
      setCurrentDate(prevWeek);
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month + 1, 1));
    } else {
      const nextWeek = new Date(currentDate);
      nextWeek.setDate(currentDate.getDate() + 7);
      setCurrentDate(nextWeek);
    }
  };

  const handleSaveReschedule = () => {
    if (!selectedItemForReschedule || !newDateVal) return;
    updateDeadline({
      contentItemId: selectedItemForReschedule.id,
      kind: dateLayer,
      newDueAt: new Date(newDateVal).toISOString(),
      changedByUserId: "u_consultant",
      reason: rescheduleReason || "Operational calendar adjustment",
    });
    setSelectedItemForReschedule(null);
    setNewDateVal("");
    setRescheduleReason("");
  };

  const handleCreateQuickItem = () => {
    if (!quickTitle.trim()) return;
    createContentItem({
      projectId,
      title: quickTitle,
      platform: quickPlatform,
      contentType: quickType,
      stage: "draft",
      accountableOwnerId: quickAssigneeId || "u_designer1",
      collaboratorIds: ["u_consultant"],
      deadlines: {
        submissionDeadline: new Date(quickDate + "T18:00:00Z").toISOString(),
        scheduledPublicationDate: new Date(quickDate + "T10:00:00Z").toISOString(),
      },
    });
    setIsQuickCreateOpen(false);
    setQuickTitle("");
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6">
      {/* Calendar Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Content Calendar
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Multi-layer date planning (Submissions, Approvals, Scheduled Releases).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle: Month vs Week */}
          <div className="flex items-center bg-[#ffffff] border border-black/[0.08] rounded-full p-1 shadow-sm text-[13px]">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3.5 py-1 rounded-full font-medium transition ${
                viewMode === "month" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3.5 py-1 rounded-full font-medium transition ${
                viewMode === "week" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              Week
            </button>
          </div>

          {/* Date Layer Selector */}
          <div className="flex items-center gap-2 bg-[#ffffff] border border-black/[0.08] rounded-full px-3.5 py-1 text-[13px] shadow-sm">
            <span className="text-[12px] text-[#86868b] font-medium">Layer:</span>
            <select
              value={dateLayer}
              onChange={(e) => setDateLayer(e.target.value as DeadlineKind)}
              className="bg-transparent text-[#1d1d1f] font-medium focus:outline-none text-[13px]"
            >
              <option value="scheduled_publication">Scheduled Publishing</option>
              <option value="submission">Submission Deadlines</option>
              <option value="resubmission">Resubmission Deadlines</option>
              <option value="approval_target">Approval Targets</option>
            </select>
          </div>

          {/* Navigator */}
          <div className="flex items-center gap-1 bg-[#ffffff] border border-black/[0.08] rounded-full px-2 py-1 shadow-sm">
            <button
              onClick={handlePrev}
              className="p-1 text-[#6e6e73] hover:text-[#1d1d1f] rounded-full transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[13px] font-semibold text-[#1d1d1f] px-2 min-w-[120px] text-center">
              {viewMode === "month"
                ? `${monthNames[month]} ${year}`
                : `Week of ${formatDate(weekDays[0])}`}
            </span>
            <button
              onClick={handleNext}
              className="p-1 text-[#6e6e73] hover:text-[#1d1d1f] rounded-full transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setIsQuickCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
          >
            <Plus className="h-3.5 w-3.5" /> Quick Schedule
          </button>
        </div>
      </div>

      {/* Month View Grid */}
      {viewMode === "month" ? (
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-7 border-b border-black/[0.08] bg-[#f5f5f7] text-center text-[12px] font-semibold text-[#6e6e73] py-3">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 auto-rows-[120px] divide-x divide-y divide-black/[0.06]">
            {calendarDays.map((dayNum, idx) => {
              if (dayNum === null) {
                return <div key={`empty-${idx}`} className="bg-[#fbfbfd]/50 p-2" />;
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const dayItems = projectItems.filter((item) => {
                const d = getItemLayerDate(item);
                if (!d) return false;
                return d.startsWith(dateStr);
              });

              const isToday = dayNum === 21 && month === 7 && year === 2026;

              return (
                <div
                  key={`day-${dayNum}`}
                  className={`p-2.5 flex flex-col justify-between hover:bg-[#f5f5f7]/40 transition ${
                    isToday ? "bg-[#eaf3fc]/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between text-[12px]">
                    <span
                      className={`font-semibold ${
                        isToday
                          ? "flex h-5 w-5 items-center justify-center rounded-full bg-[#0071e3] text-white font-bold text-[11px]"
                          : "text-[#6e6e73]"
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="text-[11px] text-[#86868b] font-medium">{dayItems.length} items</span>
                    )}
                  </div>

                  <div className="space-y-1 my-1 overflow-y-auto max-h-[75px]">
                    {dayItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedItemForReschedule(item);
                          setNewDateVal(dateStr);
                        }}
                        className="group cursor-pointer rounded-lg border border-black/[0.08] bg-[#ffffff] hover:border-[#0071e3] p-1.5 text-[11px] transition shadow-xs space-y-0.5"
                      >
                        <div className="font-semibold text-[#1d1d1f] truncate flex items-center justify-between">
                          <span className="truncate">{item.title}</span>
                          {item.contentType === "trial_reel" && (
                            <span className="rounded bg-[#f2f2f7] text-[9px] px-1 text-[#0066cc] font-bold shrink-0">
                              Trial
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#86868b]">
                          <span>{item.platform}</span>
                          <span className="capitalize text-[#1d1d1f]">{item.stage.replace("_", " ")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Week View Grid */
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-7 border-b border-black/[0.08] bg-[#f5f5f7] text-center text-[12px] font-semibold text-[#6e6e73] py-3 divide-x divide-black/[0.06]">
            {weekDays.map((d, i) => {
              const isToday = d.getDate() === 21 && d.getMonth() === 7 && d.getFullYear() === 2026;
              return (
                <div key={i} className={`p-1 ${isToday ? "text-[#0071e3] font-bold" : ""}`}>
                  <div>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}</div>
                  <div className="text-[16px] font-bold text-[#1d1d1f] mt-0.5">{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 min-h-[400px] divide-x divide-black/[0.06] bg-[#ffffff]">
            {weekDays.map((d, idx) => {
              const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const dayItems = projectItems.filter((item) => {
                const dateVal = getItemLayerDate(item);
                return dateVal && dateVal.startsWith(dStr);
              });

              return (
                <div key={idx} className="p-2.5 space-y-2 flex flex-col">
                  {dayItems.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-[11px] text-[#86868b]">
                      No items
                    </div>
                  ) : (
                    dayItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedItemForReschedule(item);
                          setNewDateVal(dStr);
                        }}
                        className="cursor-pointer rounded-xl border border-black/[0.08] bg-[#ffffff] p-2.5 hover:border-[#0071e3] transition space-y-1 shadow-xs"
                      >
                        <div className="flex items-center justify-between text-[10px] text-[#86868b]">
                          <span className="rounded bg-[#f2f2f7] px-1.5 py-0.2 text-[#1d1d1f] font-medium">{item.platform}</span>
                          <span className="capitalize">{item.stage.replace("_", " ")}</span>
                        </div>
                        <div className="font-semibold text-[#1d1d1f] truncate text-[12px]">{item.title}</div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reschedule Confirmation Modal */}
      {selectedItemForReschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Adjust Date & Reschedule</h3>
                <p className="text-[12px] text-[#86868b]">Layer: {dateLayer.replace(/_/g, " ").toUpperCase()}</p>
              </div>
              <button
                onClick={() => setSelectedItemForReschedule(null)}
                className="rounded-full p-1 text-[#86868b] hover:text-[#1d1d1f]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <span className="text-[#86868b]">Content Item:</span>
                <div className="font-semibold text-[#1d1d1f] mt-0.5">{selectedItemForReschedule.title}</div>
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">New Target Date *</label>
                <input
                  type="date"
                  value={newDateVal}
                  onChange={(e) => setNewDateVal(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Reason for Rescheduling (Audited) *</label>
                <input
                  type="text"
                  placeholder="e.g. Asset revised upon consultant request"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-black/[0.06] pt-3">
              <Link
                href={`/projects/${projectId}/content/${selectedItemForReschedule.id}`}
                className="text-[13px] text-[#0066cc] hover:underline font-medium"
              >
                Open Workspace →
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedItemForReschedule(null)}
                  className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveReschedule}
                  className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                >
                  Confirm Date
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Modal */}
      {isQuickCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Quick Schedule Item</h3>
              <button
                onClick={() => setIsQuickCreateOpen(false)}
                className="rounded-full p-1 text-[#86868b] hover:text-[#1d1d1f]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <label className="block text-[#1d1d1f] font-medium mb-1">Title / Working Headline *</label>
                <input
                  type="text"
                  placeholder="e.g. 3 Tips for High Retention"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Platform</label>
                  <select
                    value={quickPlatform}
                    onChange={(e) => setQuickPlatform(e.target.value as ContentPlatform)}
                    className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f]"
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Facebook">Facebook</option>
                    <option value="YouTube">YouTube</option>
                    <option value="X">X (Twitter)</option>
                    <option value="Email">Email</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Content Type</label>
                  <select
                    value={quickType}
                    onChange={(e) => setQuickType(e.target.value as ContentType)}
                    className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f]"
                  >
                    <option value="carousel">Carousel</option>
                    <option value="reel">Reel Video</option>
                    <option value="trial_reel">Trial Reel</option>
                    <option value="post">Single Post</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Assign to Designer</label>
                  <select
                    value={quickAssigneeId}
                    onChange={(e) => setQuickAssigneeId(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f]"
                  >
                    {projectMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.role.replace(/_/g, " ")})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1">Scheduled Target Date</label>
                  <input
                    type="date"
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-white p-2.5 text-[#1d1d1f]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] pt-3">
              <button
                onClick={() => setIsQuickCreateOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateQuickItem}
                className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Create Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
