"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/lib/context/RoleContext";
import {
  getProjectCommitmentsAction,
  upsertProjectCommitmentAction,
  upsertProjectPerformanceInputAction,
} from "@/lib/actions/commitments";
import { getEffortStandardsAction } from "@/lib/actions/effortStandards";
import { ProjectCommitment, ProjectPerformanceInput, EffortStandard } from "@/lib/types";
import {
  Folder,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  DollarSign,
  ArrowLeft,
  X,
} from "lucide-react";

export default function ProjectCommitmentsPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const { activeRole } = useRole();

  const [loading, setLoading] = useState(true);
  const [commitments, setCommitments] = useState<ProjectCommitment[]>([]);
  const [perfInput, setPerfInput] = useState<ProjectPerformanceInput | null>(null);
  const [standards, setStandards] = useState<EffortStandard[]>([]);

  // Selected Month ('YYYY-MM')
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  // New Commitment State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedWorkType, setSelectedWorkType] = useState("");
  const [targetQuantity, setTargetQuantity] = useState(4);

  // Advertising Inputs State
  const [adBudget, setAdBudget] = useState(0);
  const [adSpend, setAdSpend] = useState(0);
  const [adLeads, setAdLeads] = useState(0);
  const [adConversions, setAdConversions] = useState(0);
  const [currency, setCurrency] = useState("INR");

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId, selectedMonth]);

  const loadData = async () => {
    setLoading(true);
    const [commRes, stdRes] = await Promise.all([
      getProjectCommitmentsAction(projectId, `${selectedMonth}-01`),
      getEffortStandardsAction(),
    ]);

    if (commRes.success) {
      setCommitments(commRes.commitments);
      if (commRes.perfInput) {
        setPerfInput(commRes.perfInput);
        setAdBudget(commRes.perfInput.adBudget);
        setAdSpend(commRes.perfInput.adSpend);
        setAdLeads(commRes.perfInput.leads);
        setAdConversions(commRes.perfInput.conversions);
        setCurrency(commRes.perfInput.currency);
      } else {
        setPerfInput(null);
        setAdBudget(0);
        setAdSpend(0);
        setAdLeads(0);
        setAdConversions(0);
      }
    }

    if (stdRes.success) {
      setStandards(stdRes.standards);
      if (stdRes.standards.length > 0 && !selectedWorkType) {
        setSelectedWorkType(stdRes.standards[0].workType);
      }
    }

    setLoading(false);
  };

  const handleSaveCommitment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkType) return;

    setSaving(true);
    const matchedStd = standards.find((s) => s.workType === selectedWorkType);
    const res = await upsertProjectCommitmentAction({
      projectId,
      workTypeName: selectedWorkType,
      workTypeId: matchedStd?.id,
      committedQuantity: targetQuantity,
      effectiveMonth: `${selectedMonth}-01`,
    });

    if (res.success) {
      setNotification({ type: "success", message: `Monthly target for ${selectedWorkType} saved.` });
      setIsAddModalOpen(false);
      await loadData();
    } else {
      setNotification({ type: "error", message: res.error || "Failed to save commitment" });
    }
    setSaving(false);
  };

  const handleSaveAdvertising = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await upsertProjectPerformanceInputAction({
      projectId,
      effectiveMonth: `${selectedMonth}-01`,
      currency,
      adBudget,
      adSpend,
      leads: adLeads,
      conversions: adConversions,
    });

    if (res.success) {
      setNotification({ type: "success", message: "Monthly advertising metrics saved." });
      await loadData();
    } else {
      setNotification({ type: "error", message: res.error || "Failed to save advertising inputs" });
    }
    setSaving(false);
  };

  // Dynamic Calculated Advertising Metrics
  const calculatedCpl = adLeads > 0 ? (adSpend / adLeads).toFixed(2) : null;
  const calculatedConvRate = adLeads > 0 ? (((adConversions / adLeads) * 100)).toFixed(1) : null;
  const calculatedCostPerConv = adConversions > 0 ? (adSpend / adConversions).toFixed(2) : null;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#86868b]">
            <Link href={`/projects/${projectId}`} className="hover:text-[#0071e3] transition">
              Project Overview
            </Link>
            <span>/</span>
            <span className="text-[#1d1d1f] font-semibold">Monthly Commitments</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f] mt-1">
            Contractual Commitments & Deliverables
          </h1>
          <p className="text-sm text-[#86868b] mt-0.5">
            Configure monthly deliverable quotas and optional advertising performance inputs.
          </p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label className="text-xs font-semibold text-[#86868b]">Month:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-semibold text-[#1d1d1f]"
          />
        </div>
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
          <button onClick={() => setNotification(null)}>
            <X className="h-4 w-4 opacity-70 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* Contractual Commitments Section */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#1d1d1f]">Monthly Deliverable Targets</h3>
            <p className="text-xs text-[#86868b] mt-0.5">
              Only completed tasks classified as Contracted count toward fulfillment quota.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full text-xs font-semibold transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Target</span>
          </button>
        </div>

        {commitments.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#86868b] bg-[#fbfbfd] rounded-xl border border-black/[0.04]">
            No monthly deliverable targets configured for {selectedMonth}. Click "Add Target" to add contractual quotas.
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] border border-black/[0.06] rounded-xl overflow-hidden">
            {commitments.map((c) => (
              <div key={c.id} className="p-3.5 flex items-center justify-between hover:bg-[#fbfbfd] text-sm">
                <div>
                  <div className="font-semibold text-[#1d1d1f]">{c.workTypeName}</div>
                  <div className="text-[11px] text-[#86868b]">Effective: {selectedMonth}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 px-2.5 py-1 rounded-full">
                    Target: {c.committedQuantity} units
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Advertising & Paid Media Inputs Section */}
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-sm p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#1d1d1f]">Advertising & Paid Media Inputs (Optional)</h3>
          <p className="text-xs text-[#86868b] mt-0.5">
            For performance marketing campaigns. Leave blank for creative-only retainers.
          </p>
        </div>

        <form onSubmit={handleSaveAdvertising} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Ad Budget</label>
              <input
                type="number"
                min="0"
                value={adBudget}
                onChange={(e) => setAdBudget(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Actual Spend</label>
              <input
                type="number"
                min="0"
                value={adSpend}
                onChange={(e) => setAdSpend(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Leads Generated</label>
              <input
                type="number"
                min="0"
                value={adLeads}
                onChange={(e) => setAdLeads(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Conversions / Sales</label>
              <input
                type="number"
                min="0"
                value={adConversions}
                onChange={(e) => setAdConversions(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-semibold"
              />
            </div>
          </div>

          {/* Dynamic Calculations Bar */}
          <div className="p-3 bg-[#fbfbfd] rounded-xl border border-black/[0.04] grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-[#86868b]">Calculated CPL:</span>{" "}
              <span className="font-bold text-[#0071e3]">{calculatedCpl ? `${calculatedCpl}` : "—"}</span>
            </div>
            <div>
              <span className="text-[#86868b]">Conversion Rate:</span>{" "}
              <span className="font-bold text-[#34c759]">{calculatedConvRate ? `${calculatedConvRate}%` : "—"}</span>
            </div>
            <div>
              <span className="text-[#86868b]">Cost per Conversion:</span>{" "}
              <span className="font-bold text-[#1d1d1f]">{calculatedCostPerConv ? `${calculatedCostPerConv}` : "—"}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-[#1d1d1f] hover:bg-black text-white rounded-full text-xs font-semibold transition"
            >
              {saving ? "Saving..." : "Save Advertising Metrics"}
            </button>
          </div>
        </form>
      </div>

      {/* Add Target Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-black/[0.08] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-bold text-[#1d1d1f]">Set Monthly Target</h3>
              <button onClick={() => setIsAddModalOpen(false)}>
                <X className="h-4 w-4 text-[#86868b]" />
              </button>
            </div>

            <form onSubmit={handleSaveCommitment} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Deliverable Work Type</label>
                <select
                  value={selectedWorkType}
                  onChange={(e) => setSelectedWorkType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-medium"
                >
                  {standards.map((s) => (
                    <option key={s.id} value={s.workType}>
                      {s.workType} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1">Monthly Target Quantity (Units)</label>
                <input
                  type="number"
                  min="1"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-[#f5f5f7] border border-black/[0.08] rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-[#86868b] hover:text-[#1d1d1f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-[#0071e3] text-white rounded-full text-xs font-semibold transition"
                >
                  {saving ? "Saving..." : "Save Target"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
