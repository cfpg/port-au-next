import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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
        <div className="flex flex-row justify-between items-center px-2">
          <div className="text-center w-full py-8">
            <h1 className="text-xl font-bold text-gray-800">Port-au-Next</h1>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
