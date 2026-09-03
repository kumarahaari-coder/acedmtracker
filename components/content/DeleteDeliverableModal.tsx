"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";
import { deleteDeliverableAction } from "@/lib/actions/deleteDeliverable";
import { useRole } from "@/lib/context/RoleContext";

interface DeleteDeliverableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (result: {
    deletionType: "hard_delete" | "soft_delete";
    deletedItemIds: string[];
    deletedGroupId?: string;
  }) => void;
  item: {
    id: string;
    title: string;
    platform: string;
    contentGroupId?: string | null;
    stage?: string;
  };
  hasSiblings?: boolean;
}

export function DeleteDeliverableModal({
  isOpen,
  onClose,
  onDeleted,
  item,
  hasSiblings = false,
}: DeleteDeliverableModalProps) {
  const { activeUserId } = useRole();
  const [confirmText, setConfirmText] = useState("");
  const [deleteMode, setDeleteMode] = useState<"single" | "group">("single");
  const [reason, setReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim() === "DELETE";

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await deleteDeliverableAction({
        actorUserId: activeUserId || undefined,
        contentItemId: item.id,
        deleteEntireGroup: deleteMode === "group",
        reason: reason.trim() || undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to delete deliverable.");
        setIsDeleting(false);
        return;
      }

      setIsDeleting(false);
      onClose();

      if (onDeleted && res.deletedItemIds) {
        onDeleted({
          deletionType: res.deletionType || "soft_delete",
          deletedItemIds: res.deletedItemIds,
          deletedGroupId: res.deletedGroupId,
        });
      }
    } catch (err: any) {
      console.error("Error during deliverable deletion:", err);
      setErrorMessage(err.message || "An unexpected error occurred.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] p-6 shadow-2xl text-[#f5f5f7] relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-5 right-5 text-[#86868b] hover:text-[#f5f5f7] transition-colors disabled:opacity-50"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 text-red-400">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 id="delete-modal-title" className="text-lg font-semibold text-[#f5f5f7]">
              Delete deliverable?
            </h2>
            <p className="text-xs text-[#86868b] mt-0.5">
              {item.title} ({item.platform})
            </p>
          </div>
        </div>

        {/* Warning Body */}
        <div className="mt-4 p-3.5 rounded-xl bg-red-500/5 border border-red-500/10 flex items-start gap-3 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
          <span>
            This will remove this deliverable from active project views. This action cannot be undone from the interface.
          </span>
        </div>

        {/* Multi-Platform ContentGroup Scope Selector */}
        {item.contentGroupId && hasSiblings && (
          <div className="mt-4 space-y-2">
            <label className="text-xs font-medium text-[#a1a1a6] block">Deletion Scope:</label>
            <div className="grid grid-cols-1 gap-2">
              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                  deleteMode === "single"
                    ? "bg-[#2c2c2e] border-[#0071e3] text-[#f5f5f7]"
                    : "bg-[#141415] border-[#2c2c2e] text-[#86868b] hover:border-[#3a3a3c]"
                }`}
              >
                <input
                  type="radio"
                  name="deleteScope"
                  value="single"
                  checked={deleteMode === "single"}
                  onChange={() => setDeleteMode("single")}
                  className="accent-[#0071e3]"
                />
                <div>
                  <div className="font-medium text-[#f5f5f7]">Delete this platform deliverable only</div>
                  <div className="text-[11px] text-[#86868b]">
                    Removes {item.platform} version; sibling platforms and planned effort will be preserved.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                  deleteMode === "group"
                    ? "bg-[#2c2c2e] border-red-500/50 text-[#f5f5f7]"
                    : "bg-[#141415] border-[#2c2c2e] text-[#86868b] hover:border-[#3a3a3c]"
                }`}
              >
                <input
                  type="radio"
                  name="deleteScope"
                  value="group"
                  checked={deleteMode === "group"}
                  onChange={() => setDeleteMode("group")}
                  className="accent-red-500"
                />
                <div>
                  <div className="font-medium text-red-400">Delete entire deliverable group</div>
                  <div className="text-[11px] text-[#86868b]">
                    Removes all platform deliverables linked to this group.
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Optional Deletion Reason */}
        <div className="mt-4">
          <label className="text-xs font-medium text-[#a1a1a6] block mb-1">
            Reason for deletion <span className="text-[#86868b]">(Optional)</span>:
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Created by mistake, Duplicate, Campaign rescheduled"
            disabled={isDeleting}
            className="w-full px-3 py-2 text-xs rounded-xl bg-[#141415] border border-[#2c2c2e] text-[#f5f5f7] placeholder-[#636366] focus:outline-none focus:border-[#0071e3] transition-colors"
          />
        </div>

        {/* Explicit Confirmation Input */}
        <div className="mt-4">
          <label className="text-xs font-medium text-[#f5f5f7] block mb-1">
            To confirm, type <span className="font-bold text-red-400">DELETE</span> below:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            disabled={isDeleting}
            className="w-full px-3 py-2 text-xs rounded-xl bg-[#141415] border border-[#2c2c2e] text-[#f5f5f7] placeholder-[#636366] focus:outline-none focus:border-red-500/80 transition-colors font-mono tracking-wider"
          />
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 animate-in fade-in">
            {errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-[#2c2c2e] text-[#a1a1a6] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isDeleting ? "Deleting..." : "Delete Deliverable"}
          </button>
        </div>
      </div>
    </div>
  );
}
