'use client';

import { ReactNode } from 'react';
import Toaster from '../general/Toaster';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Port-au-Next Dashboard</h1>
        {children}
      </main>
      <Toaster />
    </>
  );
} 