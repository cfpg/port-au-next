import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SidebarContainer from "~/components/SidebarContainer";
const inter = Inter({ subsets: ["latin"] });

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Port-au-Next Dashboard",
  description: "Next.js Application Deployment Manager",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.0/css/all.min.css"
        />
      </head>
      <body className={`${inter.className} bg-gray-100 font-sans`}>
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
            <SidebarContainer />
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
      </body>
    </html>
  );
}
