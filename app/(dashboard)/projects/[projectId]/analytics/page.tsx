"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  AlertCircle,
  BarChart2,
  CheckCircle2,
  FileSpreadsheet,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { computeBestTimeRecommendation } from "@/lib/derived";
import { parseCSV, parseXLSX } from "@/lib/spreadsheet";
import { formatDate } from "@/lib/formatters";

export default function AnalyticsPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, importAnalyticsBatch } = useAppState();
  const { canViewCommercialMetrics, canManageAnalytics } = useRole();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState({
    identifier: "",
    reach: "",
    impressions: "",
    engagementRate: "",
    clicks: "",
    leads: "",
    revenue: "",
    snapshotDate: "",
  });
  const [validationPreview, setValidationPreview] = useState<{
    validRows: any[];
    invalidRows: { rowIdx: number; reason: string }[];
    duplicateRows: { rowIdx: number; reason: string }[];
  }>({ validRows: [], invalidRows: [], duplicateRows: [] });

  const [importResult, setImportResult] = useState<any>(null);

  const projectItemIds = new Set(
    state.contentItems.filter((i) => i.projectId === projectId).map((i) => i.id)
  );
  const projectSnapshots = state.analyticsSnapshots.filter((s) =>
    projectItemIds.has(s.contentItemId)
  );

  const recommendation = computeBestTimeRecommendation(
    projectId,
    state.analyticsSnapshots,
    state.contentItems
  );

  const totalReach = projectSnapshots.reduce((acc, s) => acc + s.reach, 0);
  const totalImpressions = projectSnapshots.reduce((acc, s) => acc + s.impressions, 0);
  const totalClicks = projectSnapshots.reduce((acc, s) => acc + s.clicks, 0);
  const totalLeads = projectSnapshots.reduce((acc, s) => acc + s.leads, 0);
  const totalRevenue = projectSnapshots.reduce((acc, s) => acc + s.revenue, 0);

  const avgEngagement =
    projectSnapshots.length > 0
      ? (
          projectSnapshots.reduce((acc, s) => acc + s.engagementRate, 0) /
          projectSnapshots.length
        ).toFixed(1)
      : "0";

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.type.includes("spreadsheet") || file.type.includes("excel");

    const reader = new FileReader();

    if (isXlsx) {
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer) return;
        const { headers, rows } = parseXLSX(buffer);
        processParsedData(headers, rows);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        const text = (event.target?.result as string) || "";
        const { headers, rows } = parseCSV(text);
        processParsedData(headers, rows);
      };
      reader.readAsText(file);
    }
  };

  const processParsedData = (headers: string[], rows: Record<string, string>[]) => {
    if (headers.length === 0 || rows.length === 0) {
      alert("No rows found in the selected file.");
      return;
    }

    setFileHeaders(headers);
    setParsedRows(rows);

    const autoMap = {
      identifier: headers.find((h) => /url|link|id|title|item/i.test(h)) || headers[0] || "",
      reach: headers.find((h) => /reach/i.test(h)) || headers[1] || "",
      impressions: headers.find((h) => /impression/i.test(h)) || headers[2] || "",
      engagementRate: headers.find((h) => /engagement|eng/i.test(h)) || headers[3] || "",
      clicks: headers.find((h) => /click/i.test(h)) || headers[4] || "",
      leads: headers.find((h) => /lead|inquir/i.test(h)) || headers[5] || "",
      revenue: headers.find((h) => /revenue|amount|inr/i.test(h)) || headers[6] || "",
      snapshotDate: headers.find((h) => /date|time/i.test(h)) || "",
    };
    setColumnMapping(autoMap);
    setImportStep(2);
    validateRows(rows, autoMap);
  };

  const validateRows = (rows: Record<string, string>[], mapping: typeof columnMapping) => {
    const validRows: any[] = [];
    const invalidRows: { rowIdx: number; reason: string }[] = [];
    const duplicateRows: { rowIdx: number; reason: string }[] = [];

    const projectItems = state.contentItems.filter((i) => i.projectId === projectId);
    const todayStr = new Date().toISOString().split("T")[0];

    rows.forEach((r, idx) => {
      const identVal = (r[mapping.identifier] || "").trim();
      const dateVal = (mapping.snapshotDate && r[mapping.snapshotDate] ? r[mapping.snapshotDate] : todayStr).trim();

      const matchedItem = projectItems.find(
        (i) =>
          i.id === identVal ||
          (i.liveUrl && i.liveUrl.includes(identVal)) ||
          i.title.toLowerCase().includes(identVal.toLowerCase())
      );

      if (!matchedItem) {
        invalidRows.push({
          rowIdx: idx + 1,
          reason: `Unmatched identifier '${identVal}'. Does not match any content item in this project.`,
        });
        return;
      }

      const isDup = state.analyticsSnapshots.some(
        (s) => s.contentItemId === matchedItem.id && s.snapshotDate === dateVal
      );
      if (isDup) {
        duplicateRows.push({
          rowIdx: idx + 1,
          reason: `Duplicate snapshot for item '${matchedItem.title}' on ${dateVal}.`,
        });
        return;
      }

      const reach = Math.max(0, parseInt(r[mapping.reach] || "0", 10) || 0);
      const impressions = Math.max(0, parseInt(r[mapping.impressions] || "0", 10) || 0);
      const engagementRate = Math.max(0, parseFloat(r[mapping.engagementRate] || "0") || 0);
      const clicks = Math.max(0, parseInt(r[mapping.clicks] || "0", 10) || 0);
      const leads = Math.max(0, parseInt(r[mapping.leads] || "0", 10) || 0);
      const revenue = Math.max(0, parseInt(r[mapping.revenue] || "0", 10) || 0);

      validRows.push({
        contentItemId: matchedItem.id,
        platform: matchedItem.platform,
        reach,
        impressions,
        engagementRate,
        clicks,
        leads,
        revenue,
        snapshotDate: dateVal,
      });
    });

    setValidationPreview({ validRows, invalidRows, duplicateRows });
  };

  const handleCommitImport = () => {
    if (validationPreview.validRows.length === 0) {
      alert("No valid rows to import. Please check column mappings.");
      return;
    }

    const result = importAnalyticsBatch({
      projectId,
      filename: uploadedFile?.name || "imported_metrics.csv",
      rows: validationPreview.validRows,
    });

    setImportResult(result);
    setImportStep(3);
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Performance Analytics
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Single-project isolated metric history, CSV/XLSX imports, and recommendation engine.
          </p>
        </div>

        {canManageAnalytics && (
          <button
            onClick={() => {
              setImportStep(1);
              setUploadedFile(null);
              setFileHeaders([]);
              setParsedRows([]);
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
          >
            <Upload className="h-3.5 w-3.5" /> CSV / XLSX Import
          </button>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-2">
          <div className="text-[13px] font-medium text-[#6e6e73]">Total Reach</div>
          <div className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">{totalReach.toLocaleString()}</div>
          <div className="text-[12px] text-[#86868b]">Across published content</div>
        </div>

        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-2">
          <div className="text-[13px] font-medium text-[#6e6e73]">Avg Engagement Rate</div>
          <div className="text-[32px] font-bold text-[#248a3d] tracking-tight">{avgEngagement}%</div>
          <div className="text-[12px] text-[#86868b]">Benchmark target: &gt; 5.0%</div>
        </div>

        <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-2">
          <div className="text-[13px] font-medium text-[#6e6e73]">Link Clicks & CTR</div>
          <div className="text-[32px] font-bold text-[#0071e3] tracking-tight">{totalClicks.toLocaleString()}</div>
          <div className="text-[12px] text-[#86868b]">Total traffic directed</div>
        </div>

        {canViewCommercialMetrics ? (
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-2">
            <div className="text-[13px] font-medium text-[#6e6e73]">Attributed Revenue (INR)</div>
            <div className="text-[32px] font-bold text-[#9a6700] tracking-tight">₹{totalRevenue.toLocaleString()}</div>
            <div className="text-[12px] text-[#86868b]">{totalLeads} Qualified Inquiries</div>
          </div>
        ) : (
          <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-2">
            <div className="text-[13px] font-medium text-[#86868b]">Commercial Metrics</div>
            <div className="text-[13px] font-medium text-[#86868b] italic">
              Restricted (Hidden for Designer role)
            </div>
          </div>
        )}
      </div>

      {/* Recommendation Engine Widget */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3">
        <div className="flex items-center gap-2 font-semibold text-[#1d1d1f] text-[16px]">
          <Sparkles className="h-4 w-4 text-[#9a6700]" />
          Best-Posting-Time Recommendation Engine
        </div>

        {recommendation.hasRecommendation ? (
          <div className="rounded-2xl border border-[#c4e6cc] bg-[#eaf6ed] p-4 text-[13px] space-y-2">
            <div className="font-semibold text-[#1f6f32]">{recommendation.message}</div>
            <div className="text-[#1d1d1f] text-[16px] font-bold">
              Optimal Release Window: {recommendation.recommendedTime}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#f2e2a8] bg-[#fff7e0] p-4 text-[13px] space-y-1.5">
            <div className="font-semibold text-[#8a5a00] flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> Insufficient Historical Data
            </div>
            <p className="text-[#1d1d1f] leading-relaxed">{recommendation.message}</p>
          </div>
        )}
      </div>

      {/* Snapshots Table */}
      <div className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="p-5 border-b border-black/[0.06] font-semibold text-[#1d1d1f] text-[15px]">
          Historical Snapshots ({projectSnapshots.length})
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-[#1d1d1f]">
            <thead className="bg-[#f5f5f7] text-[#6e6e73] text-[12px] font-semibold border-b border-black/[0.08]">
              <tr>
                <th className="p-3.5 pl-6">Snapshot Date</th>
                <th className="p-3.5">Content Item</th>
                <th className="p-3.5">Platform</th>
                <th className="p-3.5">Reach</th>
                <th className="p-3.5">Impressions</th>
                <th className="p-3.5">Engagement</th>
                <th className="p-3.5">Clicks</th>
                {canViewCommercialMetrics && <th className="p-3.5">Leads</th>}
                {canViewCommercialMetrics && <th className="p-3.5 pr-6">Revenue</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {projectSnapshots.map((snap) => {
                const item = state.contentItems.find((i) => i.id === snap.contentItemId);
                return (
                  <tr key={snap.id} className="hover:bg-[#f5f5f7]/60 transition">
                    <td className="p-3.5 pl-6 font-mono text-[12px] text-[#6e6e73]">{formatDate(snap.snapshotDate)}</td>
                    <td className="p-3.5 font-semibold text-[#1d1d1f] truncate max-w-xs">{item?.title || "Item"}</td>
                    <td className="p-3.5 text-[#6e6e73]">{snap.platform}</td>
                    <td className="p-3.5 font-semibold text-[#1d1d1f]">{snap.reach.toLocaleString()}</td>
                    <td className="p-3.5 text-[#6e6e73]">{snap.impressions.toLocaleString()}</td>
                    <td className="p-3.5 text-[#248a3d] font-semibold">{snap.engagementRate}%</td>
                    <td className="p-3.5 text-[#6e6e73]">{snap.clicks}</td>
                    {canViewCommercialMetrics && <td className="p-3.5 font-medium text-[#1d1d1f]">{snap.leads}</td>}
                    {canViewCommercialMetrics && <td className="p-3.5 pr-6 font-medium text-[#9a6700]">₹{snap.revenue.toLocaleString()}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV Import Modal */}
      {isImportModalOpen && canManageAnalytics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1d1d1f]">CSV / XLSX Analytics Import Wizard</h3>
                <p className="text-[12px] text-[#86868b]">Step {importStep} of 3</p>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {importStep === 1 && (
              <div className="space-y-4 text-[13px]">
                <p className="text-[#6e6e73]">
                  Select a CSV or Excel export from Meta Business Suite, LinkedIn Analytics, or Google Analytics.
                </p>

                <label className="block cursor-pointer rounded-2xl border border-dashed border-black/[0.12] hover:border-[#0071e3] bg-[#fbfbfd] p-8 text-center space-y-3 transition">
                  <FileSpreadsheet className="h-10 w-10 text-[#0071e3] mx-auto" />
                  <div className="font-semibold text-[#1d1d1f] text-[15px]">
                    {uploadedFile ? uploadedFile.name : "Click to browse CSV / XLSX file"}
                  </div>
                  <p className="text-[12px] text-[#86868b]">Supports .csv, .xlsx formatted export files</p>
                  <input
                    type="file"
                    accept=".csv, .xlsx, text/csv, text/plain"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>

                <div className="border-t border-black/[0.06] pt-3 flex items-center justify-between">
                  <span className="text-[11px] text-[#86868b]">Or test with a sample file:</span>
                  <button
                    onClick={() => {
                      const sampleCsv = `Post URL,Reach,Impressions,Engagement,Clicks,Leads,Revenue,Date\nhttps://instagram.com/p/C9x81aBqMock,14500,21000,6.5,450,22,66000,2026-08-21\nInvalid Item URL,500,800,2.0,10,0,0,2026-08-21`;
                      const blob = new Blob([sampleCsv], { type: "text/csv" });
                      const file = new File([blob], "sample_meta_report.csv");
                      const fakeEvent = { target: { files: [file] } } as any;
                      handleFileSelect(fakeEvent);
                    }}
                    className="text-[12px] text-[#0066cc] hover:underline font-medium"
                  >
                    Load Sample Meta CSV
                  </button>
                </div>
              </div>
            )}

            {importStep === 2 && (
              <div className="space-y-4 text-[13px]">
                <div className="font-medium text-[#1d1d1f]">Map Columns to Metrics:</div>

                <div className="grid grid-cols-2 gap-3 bg-[#fbfbfd] p-4 rounded-xl border border-black/[0.06]">
                  <div>
                    <label className="block text-[#86868b] text-[11px] mb-1">Item Identifier / URL *</label>
                    <select
                      value={columnMapping.identifier}
                      onChange={(e) => {
                        const m = { ...columnMapping, identifier: e.target.value };
                        setColumnMapping(m);
                        validateRows(parsedRows, m);
                      }}
                      className="w-full bg-white border border-black/[0.12] rounded-lg p-2 text-[12px] text-[#1d1d1f]"
                    >
                      {fileHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#86868b] text-[11px] mb-1">Reach Metric</label>
                    <select
                      value={columnMapping.reach}
                      onChange={(e) => {
                        const m = { ...columnMapping, reach: e.target.value };
                        setColumnMapping(m);
                        validateRows(parsedRows, m);
                      }}
                      className="w-full bg-white border border-black/[0.12] rounded-lg p-2 text-[12px] text-[#1d1d1f]"
                    >
                      {fileHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 text-[12px]">
                  <span className="status-approved rounded-full px-2.5 py-1 font-bold">
                    ✓ {validationPreview.validRows.length} Valid Rows
                  </span>
                  {validationPreview.invalidRows.length > 0 && (
                    <span className="status-changes rounded-full px-2.5 py-1 font-bold">
                      ✕ {validationPreview.invalidRows.length} Invalid / Unmatched
                    </span>
                  )}
                </div>

                <div className="flex justify-between pt-3 border-t border-black/[0.06]">
                  <button
                    onClick={() => setImportStep(1)}
                    className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCommitImport}
                    disabled={validationPreview.validRows.length === 0}
                    className="rounded-full bg-[#0071e3] disabled:opacity-50 px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
                  >
                    Commit Snapshots ({validationPreview.validRows.length})
                  </button>
                </div>
              </div>
            )}

            {importStep === 3 && importResult && (
              <div className="space-y-4 text-center py-4">
                <div className="h-12 w-12 rounded-full bg-[#eaf6ed] text-[#1f6f32] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h4 className="font-semibold text-[#1d1d1f] text-[17px]">Import Successful!</h4>
                <p className="text-[13px] text-[#6e6e73]">
                  Committed {importResult.validCount} valid snapshots.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="rounded-full bg-[#0071e3] px-6 py-2 text-[13px] font-medium text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
