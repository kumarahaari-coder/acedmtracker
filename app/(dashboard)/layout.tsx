"use client";

import React, { useState } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { Header } from "@/components/layout/Header";
import { ResetDataModal } from "@/components/layout/ResetDataModal";
import { NotificationDrawer } from "@/components/layout/NotificationDrawer";
import { AlertCircle, X } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { recoveryNotice, dismissRecoveryNotice, resetAllData } = useAppState();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col font-sans">
      {/* Recovery Toast Banner */}
      {recoveryNotice && (
        <div className="bg-[#fff7e0] border-b border-[#f2e2a8] text-[#8a5a00] px-4 py-2 text-[13px] flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#9a6700] shrink-0" />
            <span>
              <strong>Notice:</strong> {recoveryNotice}
            </span>
          </div>
          <button
            onClick={dismissRecoveryNotice}
            className="rounded p-1 hover:bg-[#ffeec2] text-[#8a5a00] transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Internal Navigation Header */}
      <Header
        onOpenResetModal={() => setIsResetModalOpen(true)}
        onOpenNotifDrawer={() => setIsNotifDrawerOpen(true)}
      />

      {/* Internal View Content */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* Modals */}
      <ResetDataModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={resetAllData}
      />
      <NotificationDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
      />
    </div>
  );
}
