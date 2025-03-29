import React from "react";
import { Metadata } from "next";

import { fetchApps } from "./actions";
import SidebarContainer from "~/components/SidebarContainer";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Port-au-Next Authentication",
  description: "Next.js Application Deployment Manager",
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apps = await fetchApps();

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar - mobile: top bar, desktop: fixed side panel */}
      <aside className="
            w-full md:w-64 
            min-h-8 md:h-screen 
            bg-white 
            shadow-lg
            md:sticky md:top-0
            z-30
            transition-all duration-300 ease-in-out
            mb-4 md:mb-0
          ">
        <SidebarContainer apps={apps} />
      </aside>
      {/* Main content */}
      <main className="
            flex-1 
            min-h-screen 
            p-4 md:p-8
          ">
        {children}
      </main>
    </div>
  );
}
