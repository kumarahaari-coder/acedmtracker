"use client";

import React from "react";
import { AlertCircle, RotateCcw, X } from "lucide-react";

interface ResetDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ResetDataModal({ isOpen, onClose, onConfirm }: ResetDataModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff0ee] text-[#d70015]">
              <RotateCcw className="h-4 w-4" />
            </div>
            <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Reset Sample Data</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 text-[14px] text-[#6e6e73] leading-relaxed">
          <p>
            This action will reset your browser localStorage back to the initial deterministic sample dataset (3 projects, initial content items, and approval states).
          </p>
          <p className="text-[13px] text-[#86868b]">
            Any temporary modifications or draft versions created during this session will be reverted.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06]">
          <button
            onClick={onClose}
            className="rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] px-4 py-2 text-[14px] font-medium text-[#1d1d1f] transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="rounded-full bg-[#d70015] hover:bg-[#b00010] px-5 py-2 text-[14px] font-medium text-white shadow-sm transition"
          >
            Reset Data
          </button>
        </div>
      </div>
    </div>
  );
}
