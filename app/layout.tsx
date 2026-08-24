import "./globals.css";
import React from "react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider } from "@/lib/context/RoleContext";

export const metadata = {
  title: "Ace Assured — Marketing Operations Dashboard",
  description: "Marketing Operations Dashboard for Ace Assured",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#ffffff] text-[#1d1d1f] font-sans antialiased selection:bg-[#0071e3]/20 selection:text-[#1d1d1f]">
        <AppStateProvider>
          <RoleProvider>{children}</RoleProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
