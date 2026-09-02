"use client";

import React, { useState, useEffect } from "react";
import { useRole } from "@/lib/context/RoleContext";
import {
  getEffortStandardsAction,
  createEffortStandardAction,
  updateEffortStandardAction,
} from "@/lib/actions/effortStandards";
import { EffortStandard } from "@/lib/types";
import {
  Sliders,
  Search,
  Filter,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Briefcase,
  History,
  Check,
  X,
  Layers,
} from "lucide-react";

const CATEGORIES = [
  "All",
  "Static",
  "Carousel",
  "Video",
  "Content",
  "Operations",
  "Advertising",
  "Web/UI",
  "Non-Creative",
];

export default function EffortStandardsAdminPage() {
  const { activeRole } = useRole();
  const [standards, setStandards] = useState<EffortStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Edit draft state
  const [draftContentHours, setDraftContentHours] = useState(0);
  const [draftProdHours, setDraftProdHours] = useState(0);
  const [draftLeadTime, setDraftLeadTime] = useState(2);
  const [draftRole, setDraftRole] = useState("Designer");
  const [draftActive, setDraftActive] = useState(true);

  // New standard modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newWorkType, setNewWorkType] = useState("");
  const [newCategory, setNewCategory] = useState("Static");
  const [newContentHours, setNewContentHours] = useState(0.5);
  const [newProdHours, setNewProdHours] = useState(1.0);
  const [newLeadTime, setNewLeadTime] = useState(2);
  const [newDefaultRole, setNewDefaultRole] = useState("Designer");

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    loadStandards();
  }, []);

  const loadStandards = async () => {
    setLoading(true);
    const res = await getEffortStandardsAction();
    if (res.success) {
      setStandards(res.standards);
    } else {
      setNotification({ type: "error", message: res.error || "Failed to load effort standards" });
    }
    setLoading(false);
  };

  const handleStartEdit = (std: EffortStandard) => {
    setEditingId(std.id);
    setDraftContentHours(std.contentSeconds / 3600);
    setDraftProdHours(std.productionSeconds / 3600);
    setDraftLeadTime(std.leadTimeWorkdays);
    setDraftRole(std.defaultRole);
    setDraftActive(std.active);
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    const res = await updateEffortStandardAction({
      id,
      contentHours: draftContentHours,
      productionHours: draftProdHours,
      leadTimeWorkdays: draftLeadTime,
      defaultRole: draftRole,
      active: draftActive,
    });

    if (res.success) {
      setNotification({ type: "success", message: "Effort standard updated successfully (new version created if effort modified)." });
      setEditingId(null);
      await loadStandards();
    } else {
      setNotification({ type: "error", message: res.error || "Failed to update standard" });
    }
    setSaving(false);
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkType.trim()) return;

    setSaving(true);
    const res = await createEffortStandardAction({
      workType: newWorkType.trim(),
      category: newCategory,
      contentHours: newContentHours,
      productionHours: newProdHours,
      leadTimeWorkdays: newLeadTime,
      defaultRole: newDefaultRole,
    });

    if (res.success) {
      setNotification({ type: "success", message: "New Effort Standard created successfully." });
      setIsNewModalOpen(false);
      setNewWorkType("");
      await loadStandards();
    } else {
      setNotification({ type: "error", message: res.error || "Failed to create standard" });
    }
    setSaving(false);
  };

  if (activeRole !== "founder" && activeRole !== "admin") {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <AlertCircle className="h-12 w-12 text-[#ff3b30] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[#1d1d1f]">Access Restricted</h2>
        <p className="text-sm text-[#86868b] mt-2">Only Founders and Administrators can manage organization Effort Standards.</p>
      </div>
    );
  }

  const filteredStandards = standards.filter((std) => {
    const matchesCategory = selectedCategory === "All" || std.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      std.workType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      std.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      std.defaultRole.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#0071e3] uppercase tracking-wider">Organization Settings</span>
            <span className="text-[12px] text-[#86868b]">• Authoritative Company Master</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] mt-1">
            Effort Standards Master
          </h1>
          <p className="text-sm text-[#86868b] mt-1">
            Authoritative base effort assumptions across 38 standard company deliverables. Historical tasks retain immutable snapshots.
          </p>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full text-sm font-medium shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Standard</span>
        </button>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm ${
            notification.type === "success"
              ? "bg-[#34c759]/10 text-[#248a3d] border border-[#34c759]/20"
              : "bg-[#ff3b30]/10 text-[#d70015] border border-[#ff3b30]/20"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-[#f5f5f7] text-[#6e6e73] hover:text-[#1d1d1f]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
          <input
            type="text"
            placeholder="Search work type, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-[#f5f5f7] border border-black/[0.06] rounded-full text-[13px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
          />
        </div>
      </div>

      {/* Standards Table */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-[#fbfbfd] text-[12px] font-semibold text-[#86868b]">
                <th className="py-3 px-4">Work Type & Category</th>
                <th className="py-3 px-4 text-right">Content Hrs</th>
                <th className="py-3 px-4 text-right">Prod Hrs</th>
                <th className="py-3 px-4 text-right">Total Base Hrs</th>
                <th className="py-3 px-4 text-center">Lead Time</th>
                <th className="py-3 px-4">Default Role</th>
                <th className="py-3 px-4 text-center">Version</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#86868b]">
                    Loading authoritative effort standards...
                  </td>
                </tr>
              ) : filteredStandards.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#86868b]">
                    No effort standards match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredStandards.map((std) => {
                  const isEditing = editingId === std.id;
                  const calculatedTotal = isEditing
                    ? draftContentHours + draftProdHours
                    : std.totalSeconds / 3600;

                  return (
                    <tr key={std.id} className="hover:bg-[#fbfbfd] transition">
                      {/* Work Type */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#1d1d1f]">{std.workType}</div>
                        <div className="text-[11px] text-[#86868b] font-medium">{std.category}</div>
                      </td>

                      {/* Content Hours */}
                      <td className="py-3.5 px-4 text-right font-medium">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={draftContentHours}
                            onChange={(e) => setDraftContentHours(parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 bg-white border border-black/[0.15] rounded-lg text-right text-[13px]"
                          />
                        ) : (
                          `${(std.contentSeconds / 3600).toFixed(2)}h`
                        )}
                      </td>

                      {/* Production Hours */}
                      <td className="py-3.5 px-4 text-right font-medium">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={draftProdHours}
                            onChange={(e) => setDraftProdHours(parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 bg-white border border-black/[0.15] rounded-lg text-right text-[13px]"
                          />
                        ) : (
                          `${(std.productionSeconds / 3600).toFixed(2)}h`
                        )}
                      </td>

                      {/* Total Base Hours (Automatically Calculated: Content + Prod) */}
                      <td className="py-3.5 px-4 text-right font-bold text-[#0071e3]">
                        {calculatedTotal.toFixed(2)}h
                      </td>

                      {/* Lead Time */}
                      <td className="py-3.5 px-4 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={draftLeadTime}
                            onChange={(e) => setDraftLeadTime(parseInt(e.target.value) || 0)}
                            className="w-14 px-2 py-1 bg-white border border-black/[0.15] rounded-lg text-center text-[13px]"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] text-[#6e6e73]">
                            <Clock className="h-3 w-3 text-[#86868b]" />
                            {std.leadTimeWorkdays}d
                          </span>
                        )}
                      </td>

                      {/* Default Role */}
                      <td className="py-3.5 px-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={draftRole}
                            onChange={(e) => setDraftRole(e.target.value)}
                            className="w-28 px-2 py-1 bg-white border border-black/[0.15] rounded-lg text-[13px]"
                          />
                        ) : (
                          <span className="text-[12px] text-[#1d1d1f] font-medium">{std.defaultRole}</span>
                        )}
                      </td>

                      {/* Version */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f5f5f7] text-[#86868b]">
                          v{std.version}
                        </span>
                      </td>

                      {/* Active Status */}
                      <td className="py-3.5 px-4 text-center">
                        {isEditing ? (
                          <input
                            type="checkbox"
                            checked={draftActive}
                            onChange={(e) => setDraftActive(e.target.checked)}
                            className="h-4 w-4 rounded text-[#0071e3]"
                          />
                        ) : std.active ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#34c759]/10 text-[#248a3d]">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-black/[0.05] text-[#86868b]">
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(std.id)}
                              disabled={saving}
                              className="px-2.5 py-1 bg-[#0071e3] text-white rounded-lg text-[12px] font-medium hover:bg-[#0077ed] transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 text-[#86868b] hover:text-[#1d1d1f] text-[12px]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEdit(std)}
                            className="px-3 py-1 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-lg text-[12px] font-medium transition"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Standard Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-black/[0.08] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.06]">
              <div>
                <h3 className="text-lg font-bold text-[#1d1d1f]">Create Effort Standard</h3>
                <p className="text-xs text-[#86868b] mt-0.5">Add a new operational deliverable to the company master.</p>
              </div>
              <button onClick={() => setIsNewModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNew} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Work Type Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3D Motion Reel, Whitepaper"
                  value={newWorkType}
                  onChange={(e) => setNewWorkType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Category *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-sm"
                  >
                    {CATEGORIES.filter((c) => c !== "All").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Default Role</label>
                  <input
                    type="text"
                    value={newDefaultRole}
                    onChange={(e) => setNewDefaultRole(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Content Hrs</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={newContentHours}
                    onChange={(e) => setNewContentHours(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Prod Hrs</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={newProdHours}
                    onChange={(e) => setNewProdHours(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Lead Time (d)</label>
                  <input
                    type="number"
                    min="0"
                    value={newLeadTime}
                    onChange={(e) => setNewLeadTime(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Total Base Preview */}
              <div className="p-3 bg-[#f5f5f7] rounded-xl flex items-center justify-between text-xs">
                <span className="text-[#6e6e73]">Calculated Total Base Effort:</span>
                <span className="font-bold text-[#0071e3] text-sm">
                  {(newContentHours + newProdHours).toFixed(2)} hours
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 text-sm text-[#86868b] hover:text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full text-sm font-semibold transition"
                >
                  {saving ? "Creating..." : "Create Standard"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
