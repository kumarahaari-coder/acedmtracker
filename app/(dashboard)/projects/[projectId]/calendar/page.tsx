"use client";

import React, { useState, useEffect } from "react";
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
  Layers,
  Sparkles,
  Lock,
} from "lucide-react";
import { ContentItem, ContentPlatform, ContentType, DeadlineKind, ScopeClassification } from "@/lib/types";
import { formatDate, getCurrentISTDate } from "@/lib/formatters";

export default function CalendarPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const {
    state,
    updateDeadline,
    createContentItem,
    createContentGroupWithItems,
    updatePublicationDetails,
  } = useAppState();
  const { activeRole, activeUserId } = useRole();

  const isManagement = activeRole === "founder" || activeRole === "consultant" || activeRole === "admin";

  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [dateLayer, setDateLayer] = useState<DeadlineKind>("scheduled_publication");

  // Dynamic runtime IST current date
  const [todayIST, setTodayIST] = useState(() => getCurrentISTDate());

  useEffect(() => {
    setTodayIST(getCurrentISTDate());
    const onFocus = () => setTodayIST(getCurrentISTDate());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Viewport navigation state (defaults to current IST month/year)
  const [currentDate, setCurrentDate] = useState(
    () => new Date(todayIST.year, todayIST.month, todayIST.day)
  );

  // Reschedule Modal
  const [selectedItemForReschedule, setSelectedItemForReschedule] = useState<ContentItem | null>(null);
  const [newDateVal, setNewDateVal] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  // Multi-Platform Quick Create Modal
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPlatforms, setQuickPlatforms] = useState<ContentPlatform[]>(["Instagram"]);
  const [quickType, setQuickType] = useState<ContentType>("carousel");
  const [quickScope, setQuickScope] = useState<ScopeClassification>("contracted");
  const [quickDate, setQuickDate] = useState(() => todayIST.dateString);
  const [quickAssigneeId, setQuickAssigneeId] = useState("u_designer1");

  const project = state.projects.find((p) => p.id === projectId);
  const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
  const projectMembers = state.projectMemberships
    .filter((m) => m.projectId === projectId && m.status === "active")
    .map((m) => {
      const user = state.users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        role: m.membershipRole || user?.role || "designer",
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
    if (dateLayer === "actual_publication") return item.publishedAt;
    if (dateLayer === "scheduled_publication") {
      if (item.stage === "published" && item.publishedAt) {
        return item.publishedAt;
      }
      return item.deadlines.scheduledPublicationDate;
    }
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

  const handleToday = () => {
    const t = getCurrentISTDate();
    setTodayIST(t);
    setCurrentDate(new Date(t.year, t.month, t.day));
  };

  const handleItemClick = (item: ContentItem, dateStr: string) => {
    if (!isManagement) {
      // Designers can view item details in workspace but cannot reschedule
      return;
    }
    setSelectedItemForReschedule(item);
    setNewDateVal(dateStr);
  };

  const handleRescheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForReschedule || !newDateVal) return;

    if (!isManagement) {
      alert("Unauthorized: Designers cannot modify publishing or scheduled dates.");
      setSelectedItemForReschedule(null);
      return;
    }

    if (dateLayer === "actual_publication") {
      updatePublicationDetails({
        contentItemId: selectedItemForReschedule.id,
        publishedAt: newDateVal,
        reason: rescheduleReason || "Date adjusted via Calendar actual publication layer",
        actorUserId: activeUserId,
      });
    } else {
      updateDeadline({
        contentItemId: selectedItemForReschedule.id,
        kind: dateLayer,
        newDueAt: newDateVal,
        changedByUserId: activeUserId,
        reason: rescheduleReason || `Rescheduled in calendar ${dateLayer} layer`,
      });
    }

    setSelectedItemForReschedule(null);
    setRescheduleReason("");
  };

  const handleTogglePlatform = (p: ContentPlatform) => {
    setQuickPlatforms((prev) =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]
    );
  };

  const handleQuickCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || quickPlatforms.length === 0) return;

    if (!isManagement) {
      alert("Unauthorized: Only management can create or schedule deliverables.");
      return;
    }

    if (quickPlatforms.length > 1) {
      // Multi-Platform: 1 ContentGroup + N platform-specific ContentItems + N ContentAssignments
      createContentGroupWithItems({
        projectId,
        title: quickTitle.trim(),
        actorUserId: activeUserId,
        platforms: quickPlatforms.map((p) => ({
          platform: p,
          contentType: quickType,
          accountableOwnerId: quickAssigneeId,
          submissionDeadline: quickDate,
          scheduledPublicationDate: quickDate,
        })),
      });
    } else {
      // Single Platform
      createContentItem({
        projectId,
        title: quickTitle.trim(),
        platform: quickPlatforms[0],
        contentType: quickType,
        stage: "draft",
        accountableOwnerId: quickAssigneeId,
        collaboratorIds: [],
        deadlines: {
          submissionDeadline: quickDate,
          scheduledPublicationDate: quickDate,
        },
        scopeClassification: quickScope,
      });
    }

    setIsQuickCreateOpen(false);
    setQuickTitle("");
    setQuickPlatforms(["Instagram"]);
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="h-6 w-6 text-[#0071e3]" />
            <h1 className="text-[28px] sm:text-[34px] font-bold text-[#1d1d1f] tracking-tight">
              Production Calendar
            </h1>
          </div>
          <p className="text-[14px] text-[#6e6e73] mt-1">
            Visual milestone scheduling with multi-layer deadline resolution in{" "}
            <span className="font-semibold text-[#1d1d1f]">Asia/Kolkata (IST)</span>.
          </p>
        </div>

        {/* Quick Schedule button: Available to Founder, Consultant, Admin */}
        {isManagement ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsQuickCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition"
            >
              <Plus className="h-4 w-4" /> Quick Schedule Item
            </button>
          </div>
        ) : (
          <span className="text-[12px] text-[#86868b] bg-[#f2f2f7] px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Designer Schedule View (Read-Only)
          </span>
        )}
      </div>

      {/* Toolbar: Navigation, Today, View Mode, and Layer Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-black/[0.08] p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Month/Week Navigation */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl border border-black/[0.04]">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg hover:bg-white text-[#1d1d1f] transition shadow-xs"
              title="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg hover:bg-white text-[#1d1d1f] transition shadow-xs"
              title="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleToday}
            className="px-3.5 py-1.5 rounded-xl border border-black/[0.08] bg-white hover:bg-[#f5f5f7] text-[13px] font-semibold text-[#1d1d1f] shadow-xs transition"
          >
            Today
          </button>

          <span className="text-[16px] font-bold text-[#1d1d1f] tracking-tight">
            {monthNames[month]} {year}
          </span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl border border-black/[0.04] text-[12px] font-medium">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3.5 py-1 rounded-lg transition ${
                viewMode === "month" ? "bg-white text-[#1d1d1f] shadow-xs font-semibold" : "text-[#6e6e73]"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3.5 py-1 rounded-lg transition ${
                viewMode === "week" ? "bg-white text-[#1d1d1f] shadow-xs font-semibold" : "text-[#6e6e73]"
              }`}
            >
              Week
            </button>
          </div>
        </div>

        {/* Milestone Layer Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider hidden md:inline">
            Milestone Layer:
          </span>
          <select
            value={dateLayer}
            onChange={(e) => setDateLayer(e.target.value as DeadlineKind)}
            className="rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-1.5 text-[13px] font-medium text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          >
            <option value="scheduled_publication">Scheduled Publication (with Live Resolution)</option>
            <option value="submission">First Submission Deadline</option>
            <option value="resubmission">Revision / Resubmission</option>
            <option value="approval_target">Target Approval Date</option>
            <option value="actual_publication">Historical Live Date (publishedAt)</option>
          </select>
        </div>
      </div>

      {/* Layer Explanation Banner */}
      <div className="px-4 py-2 bg-[#fbfbfd] border border-black/[0.06] rounded-xl text-[12px] text-[#6e6e73] flex items-center justify-between">
        <span>
          Current Layer:{" "}
          <strong className="text-[#1d1d1f] capitalize">
            {dateLayer.replace(/_/g, " ")}
          </strong>
          {dateLayer === "scheduled_publication" &&
            " — Published items dynamically resolve to their actual live date (publishedAt), while pending items stay at scheduledPublicationDate."}
        </span>
        <span className="text-[11px] text-[#86868b] font-medium">
          Org Timezone: Asia/Kolkata (IST)
        </span>
      </div>

      {/* Month View Grid */}
      {viewMode === "month" ? (
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-7 border-b border-black/[0.08] bg-[#f5f5f7] text-center text-[12px] font-semibold text-[#6e6e73] py-2.5 divide-x divide-black/[0.06]">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 auto-rows-[125px] divide-x divide-y divide-black/[0.06]">
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

              const isToday =
                dayNum === todayIST.day &&
                month === todayIST.month &&
                year === todayIST.year;

              return (
                <div
                  key={`day-${dayNum}`}
                  className={`p-2.5 flex flex-col justify-between hover:bg-[#f5f5f7]/40 transition ${
                    isToday ? "bg-[#0071e3]/[0.03]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between text-[12px]">
                    <span
                      className={`font-semibold ${
                        isToday
                          ? "flex h-6 w-6 items-center justify-center rounded-full bg-[#0071e3] text-white font-bold text-[12px] shadow-sm"
                          : "text-[#1d1d1f]"
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="text-[11px] text-[#86868b] font-medium">
                        {dayItems.length} {dayItems.length === 1 ? "item" : "items"}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 my-1 overflow-y-auto max-h-[80px]">
                    {dayItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item, dateStr)}
                        className={`group rounded-lg border border-black/[0.08] bg-[#ffffff] p-1.5 text-[11px] transition shadow-xs space-y-0.5 ${
                          isManagement ? "cursor-pointer hover:border-[#0071e3]" : "cursor-default"
                        }`}
                      >
                        <div className="font-semibold text-[#1d1d1f] truncate flex items-center justify-between">
                          <span className="truncate">{item.title}</span>
                          {item.scopeClassification === "goodwill" && (
                            <span className="rounded bg-[#eaf6ed] text-[9px] px-1 text-[#1f6f32] font-bold shrink-0">
                              Goodwill
                            </span>
                          )}
                          {item.scopeClassification === "additional_billable" && (
                            <span className="rounded bg-[#f0f7ff] text-[9px] px-1 text-[#0071e3] font-bold shrink-0">
                              Extra
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#86868b]">
                          <span>{item.platform}</span>
                          <span className="capitalize text-[#1d1d1f]">
                            {item.stage.replace("_", " ")}
                          </span>
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
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-7 border-b border-black/[0.08] bg-[#f5f5f7] text-center text-[12px] font-semibold text-[#6e6e73] py-3 divide-x divide-black/[0.06]">
            {weekDays.map((d, i) => {
              const isToday =
                d.getDate() === todayIST.day &&
                d.getMonth() === todayIST.month &&
                d.getFullYear() === todayIST.year;
              return (
                <div key={i} className={`p-1 ${isToday ? "text-[#0071e3] font-bold" : ""}`}>
                  <div>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}</div>
                  <div
                    className={`text-[16px] font-bold mt-0.5 mx-auto ${
                      isToday
                        ? "flex h-7 w-7 items-center justify-center rounded-full bg-[#0071e3] text-white shadow-sm"
                        : "text-[#1d1d1f]"
                    }`}
                  >
                    {d.getDate()}
                  </div>
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
                        onClick={() => handleItemClick(item, dStr)}
                        className={`rounded-xl border border-black/[0.08] bg-[#ffffff] p-2.5 transition space-y-1 shadow-xs ${
                          isManagement ? "cursor-pointer hover:border-[#0071e3]" : "cursor-default"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-[#86868b]">
                          <span className="rounded bg-[#f2f2f7] px-1.5 py-0.5 text-[#1d1d1f] font-medium">
                            {item.platform}
                          </span>
                          <span className="capitalize">{item.stage.replace("_", " ")}</span>
                        </div>
                        <div className="font-semibold text-[#1d1d1f] truncate text-[12px]">
                          {item.title}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reschedule Confirmation Modal (Management only) */}
      {selectedItemForReschedule && isManagement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Adjust Date &amp; Reschedule</h3>
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
                <span className="text-[#86868b]">Platform &amp; Type:</span>
                <div className="font-medium text-[#1d1d1f] mt-0.5">
                  {selectedItemForReschedule.platform} • {selectedItemForReschedule.contentType}
                </div>
              </div>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4 pt-2">
              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  New Date (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  value={newDateVal}
                  onChange={(e) => setNewDateVal(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Reason for Adjustment *
                </label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="e.g. Asset review delayed, aligned with client campaign date..."
                  rows={2}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] p-3 text-[13px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItemForReschedule(null)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
                >
                  Save Schedule Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Platform Quick Create Modal (Management only) */}
      {isQuickCreateOpen && isManagement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Quick Schedule Multi-Platform Work</h3>
                <p className="text-[12px] text-[#86868b]">Creates linked deliverables with authoritative assignments</p>
              </div>
              <button
                onClick={() => setIsQuickCreateOpen(false)}
                className="rounded-full p-1 text-[#86868b] hover:text-[#1d1d1f]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Campaign / Concept Title *
                </label>
                <input
                  type="text"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="e.g. Founder Story: Building Patient Trust"
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2 text-[14px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  required
                />
              </div>

              {/* Multi-Platform Selector */}
              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1.5">
                  Target Platforms (Multi-Select) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Instagram", "Facebook", "LinkedIn", "YouTube", "X", "Email"] as ContentPlatform[]).map((plat) => {
                    const isSelected = quickPlatforms.includes(plat);
                    return (
                      <button
                        type="button"
                        key={plat}
                        onClick={() => handleTogglePlatform(plat)}
                        className={`p-2 rounded-xl text-[12px] font-semibold transition border flex items-center justify-between ${
                          isSelected
                            ? "bg-[#eaf4ff] text-[#0071e3] border-[#0071e3]"
                            : "bg-[#fbfbfd] text-[#6e6e73] border-black/[0.08] hover:bg-[#f5f5f7]"
                        }`}
                      >
                        <span>{plat}</span>
                        {isSelected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                    Content Type
                  </label>
                  <select
                    value={quickType}
                    onChange={(e) => setQuickType(e.target.value as ContentType)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
                  >
                    <option value="post">Standard Post</option>
                    <option value="carousel">Carousel (PDF/Slides)</option>
                    <option value="reel">Reel / Short</option>
                    <option value="trial_reel">Trial Reel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                    Scope Classification
                  </label>
                  <select
                    value={quickScope}
                    onChange={(e) => setQuickScope(e.target.value as ScopeClassification)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
                  >
                    <option value="contracted">Contracted (Agreed Scope)</option>
                    <option value="goodwill">Goodwill (Value-Add Extra)</option>
                    <option value="additional_billable">Additional Billable</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Scheduled Date &amp; Deadline
                </label>
                <input
                  type="date"
                  value={quickDate}
                  onChange={(e) => setQuickDate(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3.5 py-2 text-[14px] text-[#1d1d1f] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#86868b] uppercase mb-1">
                  Assign Designer / Lead
                </label>
                <select
                  value={quickAssigneeId}
                  onChange={(e) => setQuickAssigneeId(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] bg-[#fbfbfd] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none"
                >
                  {projectMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsQuickCreateOpen(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white px-5 py-2 text-[13px] font-semibold shadow-sm transition"
                >
                  Schedule {quickPlatforms.length} Deliverables
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
