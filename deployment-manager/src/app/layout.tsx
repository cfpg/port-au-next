import type { Metadata } from "next";
import { Space_Grotesk, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Toaster from '~/components/general/Toaster';

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

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
      <body className={`${spaceGrotesk.variable} ${hankenGrotesk.variable} ${ibmPlexMono.variable} font-sans text-ink bg-canvas antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
