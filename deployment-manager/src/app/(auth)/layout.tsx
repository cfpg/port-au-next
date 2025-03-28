import type { Metadata } from "next";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Port-au-Next Authentication",
  description: "Next.js Application Deployment Manager",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
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
