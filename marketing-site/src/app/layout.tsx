import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Footer from "@/components/layout/Footer";
import Nav from "@/components/layout/Nav";
import { UmamiAnalytics } from "@/components/UmamiAnalytics";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken-grotesk",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Port-Au-Next — Your homelab can ship like the cloud",
  description:
    "A no-downtime, multi-tenant Next.js deployment manager for your own hardware. Blue-green deploys, preview branches, and managed Postgres, Redis and MinIO.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${hankenGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <Nav />
        {children}
        <Footer />
        <UmamiAnalytics />
      </body>
    </html>
  );
}
