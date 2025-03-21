'use client';

import { ReactNode } from 'react';
import ToastContainer from '../general/ToastContainer';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <ToastContainer>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Port-au-Next Dashboard</h1>
        {children}
      </main>
    </ToastContainer>
  );
} 