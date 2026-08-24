"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const projectId = (params?.projectId as string) || "proj_acme";

  return (
    <div className="flex-1 flex bg-[#ffffff]">
      {/* Apple-style Light Sidebar */}
      <Sidebar projectId={projectId} />

      {/* Main Content Pane */}
      <main className="flex-1 min-w-0 bg-[#f5f5f7]">{children}</main>
    </div>
  );
}
