import "./globals.css";
import React from "react";
import { AppStateProvider } from "@/lib/context/AppStateContext";
import { RoleProvider } from "@/lib/context/RoleContext";

import { productConfig, organizationConfig } from "@/lib/config/branding";

export const metadata = {
  title: `${productConfig.name} — ${productConfig.description}`,
  description: `${productConfig.name} Operations Platform for ${organizationConfig.name}`,
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
