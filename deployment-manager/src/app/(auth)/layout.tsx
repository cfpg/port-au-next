import type { Metadata } from "next";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Port-au-Next Authentication",
  description: "Next.js Application Deployment Manager",
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="flex flex-row justify-between items-center px-2">
        <div className="text-center w-full py-8">
          <h1 className="text-xl font-bold text-gray-800">Port-au-Next</h1>
        </div>
      </div>
      <div className="flex flex-col md:flex-row">
        {/* Main content */}
        <main className="
          flex-1 
          min-h-screen 
          p-4 md:p-8
        ">
          {children}
        </main>
      </div>
    </div>
  );
}
