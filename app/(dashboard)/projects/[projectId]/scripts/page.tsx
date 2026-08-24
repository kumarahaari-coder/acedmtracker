"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  FileCode2,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Link as LinkIcon,
  Music,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Video,
  Sparkles,
  Save,
  RotateCcw,
  Clock,
  Instagram,
  Youtube,
  Linkedin,
} from "lucide-react";
import { Script, ScriptScene, ContentPlatform } from "@/lib/types";
import { formatDate } from "@/lib/formatters";

export default function ScriptLibraryPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, createScript, updateScript, deleteScript, linkScriptToContent } = useAppState();
  const { canUploadCreative } = useRole();

  const projectScripts = state.scripts.filter((s) => s.projectId === projectId);
  const projectContentItems = state.contentItems.filter((i) => i.projectId === projectId);

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Edit draft state
  const [editTitle, setEditTitle] = useState("");
  const [editPlatform, setEditPlatform] = useState<ContentPlatform>("Instagram");
  const [editStatus, setEditStatus] = useState<Script["status"]>("ready");
  const [editHook, setEditHook] = useState("");
  const [editCTA, setEditCTA] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editMusicTrack, setEditMusicTrack] = useState("");
  const [editMusicUrl, setEditMusicUrl] = useState("");
  const [editScenes, setEditScenes] = useState<ScriptScene[]>([]);
  const [editLinkedItemId, setEditLinkedItemId] = useState<string>("");

  // Create modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPlatform, setNewPlatform] = useState<ContentPlatform>("Instagram");
  const [newHook, setNewHook] = useState("");
  const [newCTA, setNewCTA] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newMusicTrack, setNewMusicTrack] = useState("");
  const [newMusicUrl, setNewMusicUrl] = useState("");
  const [newScenes, setNewScenes] = useState<ScriptScene[]>([
    {
      sceneNumber: 1,
      visual: "Close-up hook shot with dynamic motion overlay",
      audio: "Opening hook voiceover to hook the viewer in 3 seconds...",
      onScreenText: "Did You Know? 💡",
      durationSeconds: 4,
    },
    {
      sceneNumber: 2,
      visual: "Fast-paced screen demo showing key workflow and benefit",
      audio: "Breakdown of the 3 key insights step-by-step.",
      onScreenText: "Step 1: Simplify",
      durationSeconds: 10,
    },
  ]);

  const selectedScript = projectScripts.find((s) => s.id === selectedScriptId) || projectScripts[0];

  // Sync edit form with selected script
  useEffect(() => {
    if (selectedScript) {
      setEditTitle(selectedScript.title);
      setEditPlatform(selectedScript.platform || "Instagram");
      setEditStatus(selectedScript.status || "ready");
      setEditHook(selectedScript.hook || "");
      setEditCTA(selectedScript.cta || "");
      setEditNotes(selectedScript.notes || "");
      setEditMusicTrack(selectedScript.musicTrack || "");
      setEditMusicUrl(selectedScript.musicUrl || "");
      setEditScenes(selectedScript.scenes ? JSON.parse(JSON.stringify(selectedScript.scenes)) : []);
      setEditLinkedItemId(selectedScript.linkedContentItemId || "");
    }
  }, [selectedScript?.id, isEditing]);

  const handleStartEdit = () => {
    if (selectedScript) {
      setEditTitle(selectedScript.title);
      setEditPlatform(selectedScript.platform || "Instagram");
      setEditStatus(selectedScript.status || "ready");
      setEditHook(selectedScript.hook || "");
      setEditCTA(selectedScript.cta || "");
      setEditNotes(selectedScript.notes || "");
      setEditMusicTrack(selectedScript.musicTrack || "");
      setEditMusicUrl(selectedScript.musicUrl || "");
      setEditScenes(selectedScript.scenes ? JSON.parse(JSON.stringify(selectedScript.scenes)) : []);
      setEditLinkedItemId(selectedScript.linkedContentItemId || "");
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // Add scene in Edit mode
  const handleAddEditScene = () => {
    const nextNum = editScenes.length + 1;
    setEditScenes((prev) => [
      ...prev,
      {
        sceneNumber: nextNum,
        visual: "",
        audio: "",
        onScreenText: "",
        durationSeconds: 5,
      },
    ]);
  };

  // Remove scene in Edit mode
  const handleRemoveEditScene = (index: number) => {
    setEditScenes((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    });
  };

  // Move scene in Edit mode
  const handleMoveEditScene = (index: number, direction: "up" | "down") => {
    setEditScenes((prev) => {
      const newScenes = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newScenes.length) return prev;
      const temp = newScenes[index];
      newScenes[index] = newScenes[targetIndex];
      newScenes[targetIndex] = temp;
      return newScenes.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    });
  };

  // Save changes to selected script
  const handleSaveChanges = () => {
    if (!selectedScript) return;
    if (!editTitle.trim()) {
      alert("Please provide a title for the script.");
      return;
    }

    updateScript(selectedScript.id, {
      title: editTitle.trim(),
      platform: editPlatform,
      status: editStatus,
      hook: editHook.trim(),
      cta: editCTA.trim(),
      notes: editNotes.trim(),
      musicTrack: editMusicTrack.trim() || undefined,
      musicUrl: editMusicUrl.trim() || undefined,
      scenes: editScenes,
      linkedContentItemId: editLinkedItemId || undefined,
    });

    setIsEditing(false);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3000);
  };

  // Delete selected script
  const handleDeleteSelected = () => {
    if (!selectedScript) return;
    if (confirm(`Are you sure you want to delete script "${selectedScript.title}"?`)) {
      deleteScript(selectedScript.id);
      setSelectedScriptId(null);
      setIsEditing(false);
    }
  };

  // Add scene in Create modal
  const handleAddCreateScene = () => {
    const nextNum = newScenes.length + 1;
    setNewScenes((prev) => [
      ...prev,
      {
        sceneNumber: nextNum,
        visual: "",
        audio: "",
        onScreenText: "",
        durationSeconds: 5,
      },
    ]);
  };

  // Remove scene in Create modal
  const handleRemoveCreateScene = (index: number) => {
    setNewScenes((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    });
  };

  // Create new script handler
  const handleCreateScript = () => {
    if (!newTitle.trim() || !newHook.trim()) {
      alert("Please provide a title and opening hook.");
      return;
    }

    const created = createScript({
      projectId,
      title: newTitle.trim(),
      platform: newPlatform,
      status: "ready",
      hook: newHook.trim(),
      cta: newCTA.trim(),
      scenes: newScenes.length > 0 ? newScenes : [
        { sceneNumber: 1, visual: "Opening scene", audio: newHook.trim(), durationSeconds: 5 },
      ],
      notes: newNotes.trim(),
      musicTrack: newMusicTrack.trim() || undefined,
      musicUrl: newMusicUrl.trim() || undefined,
    });

    setIsCreateModalOpen(false);
    setSelectedScriptId(created.id);
    setIsEditing(false);

    // Reset create fields
    setNewTitle("");
    setNewPlatform("Instagram");
    setNewHook("");
    setNewCTA("");
    setNewNotes("");
    setNewMusicTrack("");
    setNewMusicUrl("");
    setNewScenes([
      {
        sceneNumber: 1,
        visual: "Close-up hook shot",
        audio: "Opening hook...",
        durationSeconds: 4,
      },
    ]);
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {saveSuccessNotice && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 rounded-2xl bg-[#1d1d1f] text-white px-4 py-2.5 text-[13px] shadow-xl animate-in fade-in slide-in-from-top-2">
          <Check className="h-4 w-4 text-[#34c759]" />
          <span>Script changes saved successfully</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Script Library & Studio
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Full script editor, multi-scene breakdowns, audio/music tracks, and direct content linking.
          </p>
        </div>

        {canUploadCreative && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> Add New Script
          </button>
        )}
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Script Roster (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-black/[0.08] rounded-[20px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
          <div className="flex items-center justify-between px-3 py-1 border-b border-black/[0.06] pb-2">
            <span className="text-[12px] font-semibold text-[#86868b] uppercase tracking-wider">
              Project Scripts ({projectScripts.length})
            </span>
          </div>

          <div className="space-y-1.5 max-h-[75vh] overflow-y-auto pr-1">
            {projectScripts.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedScriptId(s.id);
                  setIsEditing(false);
                }}
                className={`w-full p-3.5 rounded-xl text-left text-[13px] transition border ${
                  s.id === selectedScript?.id
                    ? "bg-[#f5f5f7] border-black/[0.12] text-[#1d1d1f] shadow-sm"
                    : "border-transparent text-[#6e6e73] hover:bg-[#fbfbfd] hover:text-[#1d1d1f]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[#1d1d1f] truncate text-[14px]">{s.title}</div>
                  <span className="shrink-0 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white border border-black/[0.08] text-[#0071e3]">
                    {s.platform}
                  </span>
                </div>
                <div className="text-[12px] text-[#86868b] truncate mt-1">"{s.hook}"</div>
                {s.musicTrack && (
                  <div className="flex items-center gap-1 text-[11px] text-[#0066cc] mt-1.5 truncate">
                    <Music className="h-3 w-3 shrink-0" />
                    <span className="truncate">{s.musicTrack}</span>
                  </div>
                )}
              </button>
            ))}

            {projectScripts.length === 0 && (
              <div className="py-8 text-center text-[13px] text-[#86868b]">
                No scripts yet. Click "Add New Script" to begin.
              </div>
            )}
          </div>
        </div>

        {/* Right: Full Script Viewer & Editor (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-black/[0.08] rounded-[20px] p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-6">
          {selectedScript ? (
            <div>
              {/* Top Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-black/[0.06]">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#f2f2f7] text-[#1d1d1f]">
                      {isEditing ? "Editing Mode" : selectedScript.platform}
                    </span>
                    {selectedScript.linkedContentItemId && (
                      <span className="text-[11px] font-medium text-[#34c759] flex items-center gap-1">
                        <LinkIcon className="h-3 w-3" /> Linked to Deliverable
                      </span>
                    )}
                  </div>
                  <h2 className="text-[22px] font-bold text-[#1d1d1f] tracking-tight">
                    {isEditing ? editTitle || "Untitled Script" : selectedScript.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center gap-1 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-3.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition"
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                      <button
                        onClick={handleSaveChanges}
                        className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
                      >
                        <Save className="h-3.5 w-3.5" /> Save Changes
                      </button>
                    </>
                  ) : (
                    <>
                      {canUploadCreative && (
                        <button
                          onClick={handleStartEdit}
                          className="flex items-center gap-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-4 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition border border-black/[0.06]"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-[#0071e3]" /> Edit Script
                        </button>
                      )}
                      {canUploadCreative && (
                        <button
                          onClick={handleDeleteSelected}
                          className="flex items-center gap-1 rounded-full bg-white hover:bg-[#ffe5e5] px-3 py-1.5 text-[13px] font-medium text-[#ff3b30] transition border border-black/[0.08]"
                          title="Delete Script"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* VIEW MODE */}
              {!isEditing && (
                <div className="space-y-6 pt-4">
                  {/* Hook Section */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#fbfbfd] border border-black/[0.06] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#0066cc] uppercase tracking-wider">
                        Opening Hook (First 3 Seconds)
                      </span>
                    </div>
                    <p className="text-[16px] font-semibold text-[#1d1d1f]">"{selectedScript.hook}"</p>
                  </div>

                  {/* Music & Audio Track Section */}
                  {(selectedScript.musicTrack || selectedScript.musicUrl) && (
                    <div className="p-4 rounded-2xl bg-[#f5f5f7] border border-black/[0.06] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5">
                          <Music className="h-3.5 w-3.5 text-[#0071e3]" /> Music Track & Audio Reference
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
                        <div>
                          <div className="font-semibold text-[#1d1d1f]">
                            {selectedScript.musicTrack || "Audio Reference"}
                          </div>
                          {selectedScript.musicUrl && (
                            <div className="text-[12px] text-[#6e6e73] truncate max-w-md">
                              {selectedScript.musicUrl}
                            </div>
                          )}
                        </div>
                        {selectedScript.musicUrl && (
                          <a
                            href={selectedScript.musicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0071e3] border border-black/[0.08] hover:bg-[#fbfbfd] shadow-sm transition shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" /> Listen / Open Music Link
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Scene Breakdown */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[17px] font-bold text-[#1d1d1f]">
                        Scene Breakdown ({selectedScript.scenes?.length || 0} Scenes)
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {selectedScript.scenes?.map((sc) => (
                        <div
                          key={sc.sceneNumber}
                          className="p-4 rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.02)] space-y-3 text-[13px]"
                        >
                          <div className="flex items-center justify-between font-semibold text-[#1d1d1f] border-b border-black/[0.04] pb-2">
                            <span className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1d1d1f] text-white text-[11px]">
                                {sc.sceneNumber}
                              </span>
                              Scene {sc.sceneNumber}
                            </span>
                            {sc.durationSeconds && (
                              <span className="text-[12px] text-[#86868b] flex items-center gap-1 font-normal">
                                <Clock className="h-3 w-3" /> {sc.durationSeconds}s
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-[#f9f9fb] border border-black/[0.04] space-y-1">
                              <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider block">
                                Visual Direction
                              </span>
                              <p className="text-[#1d1d1f] leading-relaxed">{sc.visual || "—"}</p>
                            </div>

                            <div className="p-3 rounded-xl bg-[#f9f9fb] border border-black/[0.04] space-y-1">
                              <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider block">
                                Audio / Voice-over
                              </span>
                              <p className="text-[#1d1d1f] leading-relaxed">{sc.audio || "—"}</p>
                            </div>
                          </div>

                          {sc.onScreenText && (
                            <div className="p-2.5 rounded-xl bg-[#f2f2f7] text-[12px] text-[#1d1d1f]">
                              <span className="font-semibold text-[#6e6e73]">On-Screen Text: </span>
                              <span>{sc.onScreenText}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Call To Action */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#fbfbfd] border border-black/[0.06] space-y-1">
                    <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider">
                      Call To Action (CTA)
                    </span>
                    <p className="text-[15px] font-semibold text-[#1d1d1f]">
                      {selectedScript.cta || "No CTA specified"}
                    </p>
                  </div>

                  {/* Production Notes & Linked Deliverable */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedScript.notes && (
                      <div className="p-4 rounded-2xl border border-black/[0.06] bg-white space-y-1 text-[13px]">
                        <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider block">
                          Production Notes
                        </span>
                        <p className="text-[#6e6e73]">{selectedScript.notes}</p>
                      </div>
                    )}

                    <div className="p-4 rounded-2xl border border-black/[0.06] bg-white space-y-2 text-[13px]">
                      <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider block">
                        Linked Content Deliverable
                      </span>
                      {selectedScript.linkedContentItemId ? (
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/projects/${projectId}/content/${selectedScript.linkedContentItemId}`}
                            className="font-semibold text-[#0071e3] hover:underline truncate"
                          >
                            {projectContentItems.find((i) => i.id === selectedScript.linkedContentItemId)?.title || "View Linked Content Item"}
                          </Link>
                        </div>
                      ) : (
                        <span className="text-[#86868b]">Not linked to any calendar deliverable.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* EDIT MODE */}
              {isEditing && (
                <div className="space-y-6 pt-4 text-[13px]">
                  {/* Basic Metadata */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-[#1d1d1f] font-semibold mb-1">Script Title *</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                        placeholder="e.g. Doctor Interview: Emergency Triaging Teardown"
                      />
                    </div>

                    <div>
                      <label className="block text-[#1d1d1f] font-semibold mb-1">Platform</label>
                      <select
                        value={editPlatform}
                        onChange={(e) => setEditPlatform(e.target.value as ContentPlatform)}
                        className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                      >
                        <option value="Instagram">Instagram</option>
                        <option value="YouTube">YouTube</option>
                        <option value="LinkedIn">LinkedIn</option>
                        <option value="Facebook">Facebook</option>
                        <option value="X">X (Twitter)</option>
                        <option value="Email">Email</option>
                      </select>
                    </div>
                  </div>

                  {/* Hook */}
                  <div>
                    <label className="block text-[#1d1d1f] font-semibold mb-1">
                      Opening Hook (First 3 Seconds) *
                    </label>
                    <textarea
                      rows={2}
                      value={editHook}
                      onChange={(e) => setEditHook(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                      placeholder="What if 3 minutes could save 40% of emergency room delays?"
                    />
                  </div>

                  {/* Music & Audio Fields */}
                  <div className="p-4 rounded-2xl bg-[#f5f5f7] border border-black/[0.06] space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-[#1d1d1f]">
                      <Music className="h-4 w-4 text-[#0071e3]" /> Music Track & Audio Link
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[#6e6e73] text-[12px] font-medium mb-1">
                          Song Name / Music Track Title
                        </label>
                        <input
                          type="text"
                          value={editMusicTrack}
                          onChange={(e) => setEditMusicTrack(e.target.value)}
                          className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                          placeholder="e.g. Blinding Lights - The Weeknd or Ambient Healthcare Beat"
                        />
                      </div>

                      <div>
                        <label className="block text-[#6e6e73] text-[12px] font-medium mb-1">
                          Music Link / Audio URL (Spotify, YouTube, TikTok)
                        </label>
                        <input
                          type="url"
                          value={editMusicUrl}
                          onChange={(e) => setEditMusicUrl(e.target.value)}
                          className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                          placeholder="https://open.spotify.com/track/... or https://youtube.com/watch?v=..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Scenes Editor */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-[#1d1d1f] text-[15px]">
                          Scenes Breakdown ({editScenes.length})
                        </h3>
                        <p className="text-[12px] text-[#6e6e73]">
                          Add, edit, or reorder scenes for this video script.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddEditScene}
                        className="flex items-center gap-1 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Scene
                      </button>
                    </div>

                    <div className="space-y-3">
                      {editScenes.map((scene, index) => (
                        <div
                          key={index}
                          className="p-4 rounded-2xl border border-black/[0.10] bg-white space-y-3 shadow-sm"
                        >
                          <div className="flex items-center justify-between border-b border-black/[0.06] pb-2">
                            <span className="font-bold text-[#1d1d1f] flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1d1d1f] text-white text-[11px]">
                                {index + 1}
                              </span>
                              Scene {index + 1}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMoveEditScene(index, "up")}
                                disabled={index === 0}
                                className="p-1 rounded-lg hover:bg-[#f5f5f7] disabled:opacity-30"
                                title="Move Up"
                              >
                                <ArrowUp className="h-3.5 w-3.5 text-[#1d1d1f]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveEditScene(index, "down")}
                                disabled={index === editScenes.length - 1}
                                className="p-1 rounded-lg hover:bg-[#f5f5f7] disabled:opacity-30"
                                title="Move Down"
                              >
                                <ArrowDown className="h-3.5 w-3.5 text-[#1d1d1f]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveEditScene(index)}
                                className="p-1 rounded-lg text-[#ff3b30] hover:bg-[#ffe5e5] ml-1"
                                title="Remove Scene"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-[#6e6e73] uppercase tracking-wider mb-1">
                                Visual Direction
                              </label>
                              <textarea
                                rows={2}
                                value={scene.visual}
                                onChange={(e) => {
                                  const updated = [...editScenes];
                                  updated[index].visual = e.target.value;
                                  setEditScenes(updated);
                                }}
                                className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                                placeholder="Describe the visual camera angle, action, or onscreen graphics"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-[#6e6e73] uppercase tracking-wider mb-1">
                                Audio / Voice-over / Dialogue
                              </label>
                              <textarea
                                rows={2}
                                value={scene.audio}
                                onChange={(e) => {
                                  const updated = [...editScenes];
                                  updated[index].audio = e.target.value;
                                  setEditScenes(updated);
                                }}
                                className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                                placeholder="Exact spoken voiceover lines or sound effects"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-[#6e6e73] uppercase tracking-wider mb-1">
                                On-Screen Text / Captions
                              </label>
                              <input
                                type="text"
                                value={scene.onScreenText || ""}
                                onChange={(e) => {
                                  const updated = [...editScenes];
                                  updated[index].onScreenText = e.target.value;
                                  setEditScenes(updated);
                                }}
                                className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                                placeholder="e.g. 52% Average Wait Time"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-[#6e6e73] uppercase tracking-wider mb-1">
                                Duration (Seconds)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={300}
                                value={scene.durationSeconds || 5}
                                onChange={(e) => {
                                  const updated = [...editScenes];
                                  updated[index].durationSeconds = Number(e.target.value) || 5;
                                  setEditScenes(updated);
                                }}
                                className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <div>
                    <label className="block text-[#1d1d1f] font-semibold mb-1">Call To Action (CTA)</label>
                    <input
                      type="text"
                      value={editCTA}
                      onChange={(e) => setEditCTA(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                      placeholder="e.g. Tap the link in bio to read our hospital operations whitepaper."
                    />
                  </div>

                  {/* Notes & Linked Deliverable */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[#1d1d1f] font-semibold mb-1">Production Notes</label>
                      <textarea
                        rows={2}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                        placeholder="Camera settings, props, overlays..."
                      />
                    </div>

                    <div>
                      <label className="block text-[#1d1d1f] font-semibold mb-1">
                        Link to Project Deliverable
                      </label>
                      <select
                        value={editLinkedItemId}
                        onChange={(e) => setEditLinkedItemId(e.target.value)}
                        className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                      >
                        <option value="">-- No Linked Deliverable --</option>
                        {projectContentItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} ({item.platform})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Bottom Save Action Bar */}
                  <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06]">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="rounded-full bg-[#f5f5f7] px-5 py-2 text-[13px] font-medium text-[#1d1d1f] hover:bg-[#e8e8ed] transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-6 py-2 text-[13px] font-medium text-white shadow-sm transition active:scale-[0.98]"
                    >
                      Save All Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-[#86868b]">
              <FileCode2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-[15px] font-medium text-[#1d1d1f]">No script selected</p>
              <p className="text-[13px] text-[#86868b] mt-1">Select a script on the left or create a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE SCRIPT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-black/[0.08] bg-white p-6 sm:p-7 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[18px] font-bold text-[#1d1d1f]">Create New Script</h3>
                <p className="text-[12px] text-[#6e6e73]">
                  Draft a video or reel script with hook, music track, and scenes.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] p-1 rounded-full hover:bg-[#f5f5f7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-[13px]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[#1d1d1f] font-semibold mb-1">Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. 5 Signs You Need Preventative Care"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  />
                </div>

                <div>
                  <label className="block text-[#1d1d1f] font-semibold mb-1">Platform</label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value as ContentPlatform)}
                    className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="YouTube">YouTube</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Facebook">Facebook</option>
                    <option value="X">X (Twitter)</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-semibold mb-1">Opening Hook *</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Stop making this common mistake when choosing health insurance..."
                  value={newHook}
                  onChange={(e) => setNewHook(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              {/* Music & Audio Options */}
              <div className="p-3.5 rounded-2xl bg-[#f5f5f7] border border-black/[0.06] space-y-2.5">
                <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5">
                  <Music className="h-3.5 w-3.5 text-[#0071e3]" /> Music Track & Audio Link
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#6e6e73] text-[11px] font-medium mb-1">
                      Song Name / Track Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. As It Was - Harry Styles"
                      value={newMusicTrack}
                      onChange={(e) => setNewMusicTrack(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#6e6e73] text-[11px] font-medium mb-1">
                      Music Link / Audio URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://open.spotify.com/... or https://youtube.com/..."
                      value={newMusicUrl}
                      onChange={(e) => setNewMusicUrl(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.12] p-2 text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                    />
                  </div>
                </div>
              </div>

              {/* Initial Scenes Builder */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#1d1d1f]">
                    Scenes ({newScenes.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddCreateScene}
                    className="text-[12px] font-semibold text-[#0071e3] hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Scene
                  </button>
                </div>

                <div className="space-y-2.5">
                  {newScenes.map((sc, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border border-black/[0.08] bg-[#fbfbfd] space-y-2"
                    >
                      <div className="flex items-center justify-between text-[12px] font-semibold text-[#1d1d1f]">
                        <span>Scene {i + 1}</span>
                        {newScenes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCreateScene(i)}
                            className="text-[#ff3b30] hover:underline text-[11px]"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Visual direction..."
                          value={sc.visual}
                          onChange={(e) => {
                            const updated = [...newScenes];
                            updated[i].visual = e.target.value;
                            setNewScenes(updated);
                          }}
                          className="rounded-lg border border-black/[0.12] p-2 text-[12px] text-[#1d1d1f] bg-white"
                        />
                        <input
                          type="text"
                          placeholder="Audio / dialogue..."
                          value={sc.audio}
                          onChange={(e) => {
                            const updated = [...newScenes];
                            updated[i].audio = e.target.value;
                            setNewScenes(updated);
                          }}
                          className="rounded-lg border border-black/[0.12] p-2 text-[12px] text-[#1d1d1f] bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-semibold mb-1">Call To Action (CTA)</label>
                <input
                  type="text"
                  placeholder="e.g. Link in bio for our free healthcare guide"
                  value={newCTA}
                  onChange={(e) => setNewCTA(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f] font-semibold mb-1">Production Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Use high-key clinical lighting"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#e8e8ed] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateScript}
                className="rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-5 py-2 text-[13px] font-medium text-white shadow-sm transition active:scale-[0.98]"
              >
                Create Script
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
