"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { Header } from "@/components/layout/Header";
import { NotificationDrawer } from "@/components/layout/NotificationDrawer";
import { AlertCircle, ShieldCheck, X, Loader2 } from "lucide-react";
import { getAuthoritativeWorkspaceStateAction } from "@/lib/actions/workspace";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { state, recoveryNotice, dismissRecoveryNotice, hydrateServerState } = useAppState();
  const { activeRole, activeUserId, setUserSession } = useRole();
  const router = useRouter();

  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate and maintain authoritative workspace state
  useEffect(() => {
    let isMounted = true;
    let isSyncing = false;
    let focusTimeout: any = null;

    let lastSyncedAt = 0;

    async function loadWorkspace() {
      if (isSyncing || !isMounted) return;
      isSyncing = true;
      try {
        const result = await getAuthoritativeWorkspaceStateAction();
        if (isMounted && result.success) {
          lastSyncedAt = Date.now();
          if (hydrateServerState) {
            hydrateServerState(result.state);
          }
          if (result.user) {
            setUserSession({
              id: result.user.id,
              role: (result.user.organizationRole as any) || "founder",
              email: result.user.email,
              name: result.user.fullName,
            });
          }
        }
      } catch (err) {
        console.warn("[DashboardLayout] Workspace sync notice:", err);
      } finally {
        isSyncing = false;
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    // Initial authoritative load
    loadWorkspace();

    // Revalidate on focus ONLY if stale by > 60 seconds and document is visible
    const handleFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (Date.now() - lastSyncedAt < 60000) return; // Stale-time guard (60s)
      clearTimeout(focusTimeout);
      focusTimeout = setTimeout(() => {
        if (!isSyncing && isMounted && Date.now() - lastSyncedAt >= 60000) {
          loadWorkspace();
        }
      }, 1000);
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      isMounted = false;
      clearTimeout(focusTimeout);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);

  // Client Routing Protection: Clients must never enter internal dashboard workspace
  useEffect(() => {
    if (activeRole === "client") {
      const clientMemberships = state.projectMemberships.filter(
        (m) => m.userId === activeUserId && m.status === "active"
      );
      const accessibleProjects = state.projects.filter(
        (p) => p.status !== "archived" && clientMemberships.some((m) => m.projectId === p.id)
      );

      if (accessibleProjects.length === 1) {
        router.replace(`/portal/${accessibleProjects[0].id}`);
      } else {
        router.replace("/portal");
      }
    }
  }, [activeRole, activeUserId, state.projectMemberships, state.projects, router]);

  // If active user is a client, render safe transitional message without internal shell
  if (activeRole === "client") {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-black/[0.08] shadow-xl space-y-4 animate-in fade-in">
          <div className="h-12 w-12 rounded-full bg-[#f0f7ff] text-[#0071e3] flex items-center justify-center mx-auto border border-[#d0e5ff]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-[18px] font-bold text-[#1d1d1f]">Entering Client Portal...</h2>
          <p className="text-[13px] text-[#6e6e73] leading-relaxed">
            Redirecting your session to your dedicated workspace portal.
          </p>
        </div>
      </div>
    );
  }

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
      <Header onOpenNotifDrawer={() => setIsNotifDrawerOpen(true)} />

      {/* Internal View Content */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* Modals */}
      <NotificationDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
      />
    </div>
  );
}
