"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import {
  Download,
  ExternalLink,
  FolderKanban,
  HardDrive,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

export default function AssetVaultPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";
  const { state, addAsset, deleteAsset } = useAppState();
  const { canUploadCreative, activeUserId } = useRole();

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [isDriveLink, setIsDriveLink] = useState(false);

  const projectAssets = state.assets.filter((a) => a.projectId === projectId);

  const handleAddAsset = () => {
    if (!assetName.trim()) return;

    addAsset({
      projectId,
      name: assetName.trim(),
      mimeType: isDriveLink ? "application/vnd.google-apps.folder" : "image/png",
      fileSizeBytes: isDriveLink ? 0 : 5 * 1024 * 1024,
      previewUrl: isDriveLink ? "" : "https://placehold.co/600x400/f5f5f7/1d1d1f?text=Asset+Preview",
      tags: ["production", "brand"],
      isDriveLink,
      driveUrl: isDriveLink ? driveUrl.trim() : undefined,
      uploadedByUserId: activeUserId,
    });

    setIsUploadModalOpen(false);
    setAssetName("");
    setDriveUrl("");
    setIsDriveLink(false);
  };

  return (
    <div className="p-8 sm:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1d1d1f] tracking-tight">
            Asset Vault
          </h1>
          <p className="text-[14px] text-[#6e6e73]">
            Digital asset management with 100 MB upload threshold and Google Drive linking.
          </p>
        </div>

        {canUploadCreative && (
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
          >
            <Plus className="h-3.5 w-3.5" /> Add Asset
          </button>
        )}
      </div>

      {/* Asset Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {projectAssets.map((a) => (
          <div
            key={a.id}
            className="bg-[#ffffff] border border-black/[0.08] rounded-[20px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col justify-between space-y-4 hover:shadow-md transition"
          >
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl bg-[#f5f5f7] aspect-video flex items-center justify-center border border-black/[0.06]">
                {a.previewUrl ? (
                  <img src={a.previewUrl} alt={a.name} className="w-full h-full object-contain" />
                ) : (
                  <HardDrive className="h-10 w-10 text-[#86868b]" />
                )}
              </div>

              <div>
                <h3 className="font-semibold text-[15px] text-[#1d1d1f] truncate">{a.name}</h3>
                <div className="text-[12px] text-[#86868b] mt-0.5">
                  {a.isDriveLink ? "Google Drive Folder" : `${(a.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-black/[0.06]">
              {a.isDriveLink ? (
                <a
                  href={a.driveUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[13px] text-[#0066cc] hover:underline font-medium"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Drive
                </a>
              ) : (
                <span className="text-[12px] text-[#86868b]">Local Storage Asset</span>
              )}

              {canUploadCreative && (
                <button
                  onClick={() => deleteAsset(a.id)}
                  className="text-[#86868b] hover:text-[#d70015] p-1 rounded-full transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Asset Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Add Asset to Vault</h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-[#86868b]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <div>
                <label className="block font-medium text-[#1d1d1f] mb-1">Asset Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Master Logo Kit 2026"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                />
              </div>

              <label className="flex items-center gap-2 text-[#1d1d1f]">
                <input
                  type="checkbox"
                  checked={isDriveLink}
                  onChange={(e) => setIsDriveLink(e.target.checked)}
                />
                <span>Store as Google Drive Link (For assets &gt; 100 MB)</span>
              </label>

              {isDriveLink && (
                <div>
                  <label className="block font-medium text-[#1d1d1f] mb-1">Google Drive URL *</label>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.12] p-2.5 text-[#1d1d1f]"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] text-[#1d1d1f]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAsset}
                className="rounded-full bg-[#0071e3] px-5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                Save Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
