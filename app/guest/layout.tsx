import React from "react";

export const metadata = {
  title: "Ace Assured — Client Review Portal",
  description: "Secure isolated content review portal",
};

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans flex flex-col selection:bg-[#0071e3]/20 selection:text-[#1d1d1f]">
      {children}
    </div>
  );
}
