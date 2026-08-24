"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FolderArchive,
  FolderPlus,
  Layers,
  LayoutGrid,
  ListFilter,
  Plus,
  Sparkles,
  Table as TableIcon,
  Users,
  X,
} from "lucide-react";
import { Project, ContentPlatform, ContentType } from "@/lib/types";

export default function ProjectsPortfolioPage() {
  const router = useRouter();
  const { state, createProject, archiveProject, restoreProject } = useAppState();
  const { canCreateProjects, canManageRetention, setActiveProjectId } = useRole();

  const [viewLayout, setViewLayout] = useState<"cards" | "table">("cards");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active");

  // 5-Step Creation Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [newProjectName, setNewProjectName] = useState("");
  const [newClientBrand, setNewClientBrand] = useState("");
  const [newScope, setNewScope] = useState("");
  const [newTimezone, setNewTimezone] = useState("Asia/Kolkata");
  const [targetPosts, setTargetPosts] = useState(12);
  const [targetCarousels, setTargetCarousels] = useState(6);
  const [targetReels, setTargetReels] = useState(8);
  const [targetTrialReels, setTargetTrialReels] = useState(2);

  const filteredProjects = state.projects.filter((p) => {
    if (filterStatus === "all") return true;
    return p.status === filterStatus;
  });

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    router.push(`/projects/${projectId}`);
  };

  const handleFinishWizard = () => {
    if (!newProjectName.trim() || !newClientBrand.trim()) {
      alert("Please fill in the project and brand name.");
      return;
    }

    const avatar = newClientBrand
      .split(" ")
      .map((w) => w[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    const created = createProject({
      name: newProjectName,
      clientBrand: newClientBrand,
      avatar: avatar || "PR",
      scope: newScope || "Comprehensive marketing operations & social content delivery.",
      timezone: newTimezone,
      status: "active",
      targetRequirements: {
        posts: Number(targetPosts),
        carousels: Number(targetCarousels),
        reels: Number(targetReels),
        trialReels: Number(targetTrialReels),
      },
      workflowStages: ["Idea", "Draft", "Submitted", "In Review", "Changes Requested", "Approved", "Scheduled", "Published", "Reported"],
    });

    setIsWizardOpen(false);
    setWizardStep(1);
    setNewProjectName("");
    setNewClientBrand("");
    setNewScope("");
    handleSelectProject(created.id);
  };

  return (
    <div className="flex-1 bg-[#f5f5f7] min-h-screen py-10 px-6 sm:px-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Apple-style Page Title Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
          <div className="space-y-1.5">
            <h1 className="text-[36px] sm:text-[44px] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Projects Portfolio
            </h1>
            <p className="text-[16px] text-[#6e6e73] font-normal">
              Manage client brands, track quarterly target progress, and review marketing deliverables.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Layout Toggle */}
            <div className="flex items-center bg-[#ffffff] border border-black/[0.08] rounded-full p-1 shadow-sm">
              <button
                onClick={() => setViewLayout("cards")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                  viewLayout === "cards" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Cards
              </button>
              <button
                onClick={() => setViewLayout("table")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition ${
                  viewLayout === "table" ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" /> Table
              </button>
            </div>

            {/* Creation Wizard Button */}
            {canCreateProjects && (
              <button
                onClick={() => {
                  setWizardStep(1);
                  setIsWizardOpen(true);
                }}
                className="flex items-center gap-2 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-5 py-2 text-[14px] font-medium text-white shadow-sm transition"
              >
                <Plus className="h-4 w-4" /> New Project
              </button>
            )}
          </div>
        </div>

        {/* Portfolio Status Filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStatus("active")}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition ${
              filterStatus === "active"
                ? "bg-[#ffffff] text-[#1d1d1f] shadow-sm border border-black/[0.08]"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Active Projects ({state.projects.filter((p) => p.status === "active").length})
          </button>
          <button
            onClick={() => setFilterStatus("archived")}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition ${
              filterStatus === "archived"
                ? "bg-[#ffffff] text-[#1d1d1f] shadow-sm border border-black/[0.08]"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            }`}
          >
            Archived Projects ({state.projects.filter((p) => p.status === "archived").length})
          </button>
        </div>

        {/* Projects Cards Layout */}
        {viewLayout === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => {
              const projectItems = state.contentItems.filter((i) => i.projectId === project.id);
              const publishedCount = projectItems.filter((i) => i.stage === "published").length;
              const inReviewCount = projectItems.filter((i) => i.stage === "in_review" || i.stage === "submitted").length;
              const changesReqCount = projectItems.filter((i) => i.stage === "changes_requested").length;

              const totalTarget =
                project.targetRequirements.posts +
                project.targetRequirements.carousels +
                project.targetRequirements.reels +
                project.targetRequirements.trialReels;

              const completionPct = totalTarget > 0 ? Math.min(100, Math.round((publishedCount / totalTarget) * 100)) : 0;

              return (
                <div
                  key={project.id}
                  className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col justify-between hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition space-y-6"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] text-[#1d1d1f] font-bold text-[14px]">
                          {project.avatar}
                        </div>
                        <div>
                          <h2 className="text-[18px] font-semibold text-[#1d1d1f] tracking-tight line-clamp-1">
                            {project.name}
                          </h2>
                          <p className="text-[13px] text-[#6e6e73] font-normal">{project.clientBrand}</p>
                        </div>
                      </div>

                      {project.status === "archived" && (
                        <span className="status-draft rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                          Archived
                        </span>
                      )}
                    </div>

                    <p className="text-[14px] text-[#6e6e73] line-clamp-2 leading-relaxed font-normal">
                      {project.scope}
                    </p>

                    {/* Progress Bar */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-[13px]">
                        <span className="font-medium text-[#1d1d1f]">Target Deliverables</span>
                        <span className="font-semibold text-[#1d1d1f]">
                          {publishedCount} / {totalTarget} ({completionPct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#f2f2f7] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0071e3] transition-all duration-300"
                          style={{ width: `${completionPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Operational Status Pills */}
                    <div className="flex items-center gap-2 pt-1">
                      {inReviewCount > 0 && (
                        <span className="status-review rounded-full px-2.5 py-0.5 text-[12px] font-medium">
                          {inReviewCount} in review
                        </span>
                      )}
                      {changesReqCount > 0 && (
                        <span className="status-changes rounded-full px-2.5 py-0.5 text-[12px] font-medium">
                          {changesReqCount} changes req
                        </span>
                      )}
                      {inReviewCount === 0 && changesReqCount === 0 && (
                        <span className="status-approved rounded-full px-2.5 py-0.5 text-[12px] font-medium">
                          On track
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-black/[0.06]">
                    <button
                      onClick={() => handleSelectProject(project.id)}
                      className="flex items-center gap-1.5 text-[14px] font-medium text-[#0066cc] hover:text-[#0077ed] transition"
                    >
                      Open Overview <ChevronRight className="h-4 w-4" />
                    </button>

                    {canManageRetention && (
                      <button
                        onClick={() => {
                          if (project.status === "active") {
                            archiveProject(project.id);
                          } else {
                            restoreProject(project.id);
                          }
                        }}
                        className="text-[12px] font-medium text-[#86868b] hover:text-[#1d1d1f] transition"
                      >
                        {project.status === "active" ? "Archive" : "Restore"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table Layout */
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] text-[#1d1d1f]">
                <thead className="bg-[#f5f5f7] text-[#6e6e73] text-[12px] font-semibold border-b border-black/[0.08]">
                  <tr>
                    <th className="p-4 pl-6">Project & Brand</th>
                    <th className="p-4">Timezone</th>
                    <th className="p-4">Target Progress</th>
                    <th className="p-4">Active Deliverables</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {filteredProjects.map((project) => {
                    const projectItems = state.contentItems.filter((i) => i.projectId === project.id);
                    const publishedCount = projectItems.filter((i) => i.stage === "published").length;
                    const totalTarget =
                      project.targetRequirements.posts +
                      project.targetRequirements.carousels +
                      project.targetRequirements.reels +
                      project.targetRequirements.trialReels;

                    return (
                      <tr key={project.id} className="hover:bg-[#f5f5f7]/60 transition">
                        <td className="p-4 pl-6">
                          <div className="font-semibold text-[#1d1d1f]">{project.name}</div>
                          <div className="text-[12px] text-[#86868b]">{project.clientBrand}</div>
                        </td>
                        <td className="p-4 text-[#6e6e73] font-mono text-[12px]">{project.timezone}</td>
                        <td className="p-4">
                          <span className="font-medium">
                            {publishedCount} / {totalTarget} published
                          </span>
                        </td>
                        <td className="p-4 text-[#6e6e73]">{projectItems.length} total items</td>
                        <td className="p-4 pr-6 text-right">
                          <button
                            onClick={() => handleSelectProject(project.id)}
                            className="rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition"
                          >
                            Open Project
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 5-Step Project Creation Wizard Modal */}
      {isWizardOpen && canCreateProjects && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-xl rounded-[22px] border border-black/[0.08] bg-white p-7 shadow-2xl space-y-6">
            {/* Wizard Header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
              <div>
                <h3 className="text-[20px] font-semibold text-[#1d1d1f]">Create New Project</h3>
                <p className="text-[13px] text-[#6e6e73]">Step {wizardStep} of 5</p>
              </div>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="rounded-full p-1.5 text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step 1: Client & Basic Info */}
            {wizardStep === 1 && (
              <div className="space-y-4 text-[14px]">
                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1.5">Project Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Apple Health 2026 Brand Campaign"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#ffffff] p-3 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                  />
                </div>

                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1.5">Client Brand Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Apple Health"
                    value={newClientBrand}
                    onChange={(e) => setNewClientBrand(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#ffffff] p-3 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                  />
                </div>

                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1.5">Scope & Strategic Goals</label>
                  <textarea
                    rows={3}
                    placeholder="Describe content delivery objectives and platforms..."
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#ffffff] p-3 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Timezone & Operating Hours */}
            {wizardStep === 2 && (
              <div className="space-y-4 text-[14px]">
                <div>
                  <label className="block text-[#1d1d1f] font-medium mb-1.5">Operating Timezone *</label>
                  <select
                    value={newTimezone}
                    onChange={(e) => setNewTimezone(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] bg-[#ffffff] p-3 text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST - India Standard Time)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  </select>
                </div>
                <p className="text-[13px] text-[#6e6e73]">
                  All calendar deadlines, reminder notifications, and analytics timestamps will align with this timezone.
                </p>
              </div>
            )}

            {/* Step 3: Target Deliverables */}
            {wizardStep === 3 && (
              <div className="space-y-4 text-[14px]">
                <p className="text-[#6e6e73]">Define target quotas for the quarter:</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#1d1d1f] font-medium mb-1">Single Posts</label>
                    <input
                      type="number"
                      value={targetPosts}
                      onChange={(e) => setTargetPosts(Number(e.target.value))}
                      className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#1d1d1f] font-medium mb-1">Carousels</label>
                    <input
                      type="number"
                      value={targetCarousels}
                      onChange={(e) => setTargetCarousels(Number(e.target.value))}
                      className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#1d1d1f] font-medium mb-1">Reels (Standard)</label>
                    <input
                      type="number"
                      value={targetReels}
                      onChange={(e) => setTargetReels(Number(e.target.value))}
                      className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#1d1d1f] font-medium mb-1">Trial Reels</label>
                    <input
                      type="number"
                      value={targetTrialReels}
                      onChange={(e) => setTargetTrialReels(Number(e.target.value))}
                      className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Workflow Stages */}
            {wizardStep === 4 && (
              <div className="space-y-3 text-[14px]">
                <p className="text-[#6e6e73]">Standard 7-Stage Review Workflow:</p>
                <div className="p-3 rounded-xl bg-[#f5f5f7] text-[13px] text-[#1d1d1f] space-y-1">
                  <div>1. Draft → 2. Submitted → 3. In Review → 4. Changes Requested</div>
                  <div>5. Approved (3-Component Matrix) → 6. Scheduled → 7. Published</div>
                </div>
                <p className="text-[12px] text-[#86868b]">
                  Enforces independent Founder & Consultant gating for Copy, Creative, and Posting Date.
                </p>
              </div>
            )}

            {/* Step 5: Summary Review */}
            {wizardStep === 5 && (
              <div className="space-y-3 text-[14px]">
                <div className="rounded-xl bg-[#f5f5f7] p-4 space-y-2 text-[13px]">
                  <div><strong>Project:</strong> {newProjectName}</div>
                  <div><strong>Client Brand:</strong> {newClientBrand}</div>
                  <div><strong>Timezone:</strong> {newTimezone}</div>
                  <div><strong>Target:</strong> {targetPosts + targetCarousels + targetReels + targetTrialReels} deliverables</div>
                </div>
              </div>
            )}

            {/* Wizard Navigation Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-black/[0.06]">
              {wizardStep > 1 ? (
                <button
                  onClick={() => setWizardStep((prev) => (prev - 1) as any)}
                  className="rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-4 py-2 text-[14px] font-medium text-[#1d1d1f] transition"
                >
                  Back
                </button>
              ) : <div />}

              {wizardStep < 5 ? (
                <button
                  onClick={() => setWizardStep((prev) => (prev + 1) as any)}
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-5 py-2 text-[14px] font-medium text-white transition"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleFinishWizard}
                  className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-6 py-2 text-[14px] font-medium text-white shadow-sm transition"
                >
                  Create & Launch Project
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
