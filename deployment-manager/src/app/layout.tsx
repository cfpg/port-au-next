import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Toaster from '~/components/general/Toaster';

const inter = Inter({ subsets: ["latin"] });

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Port-au-Next Dashboard",
  description: "Next.js Application Deployment Manager",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.0/css/all.min.css"
        />
      </head>
      <body className={`${inter.className} bg-gray-100 font-sans`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
