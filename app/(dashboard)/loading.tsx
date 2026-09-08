import React from "react";
import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-in fade-in duration-200">
      <div className="h-10 w-10 rounded-2xl bg-[#0071e3]/[0.08] text-[#0071e3] flex items-center justify-center border border-[#0071e3]/10 mb-3 shadow-xs">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
      <div className="font-semibold text-[14px] text-[#1d1d1f]">Loading workspace...</div>
      <div className="text-[12px] text-[#86868b] mt-0.5">Fetching authoritative records</div>
    </div>
  );
}
