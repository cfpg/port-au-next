'use client';

import { useState } from 'react';
import AppRegistrationForm from './AppRegistrationForm';
import { useToast } from './general/ToastContainer';

interface AppRegistrationData {
  name: string;
  repository: string;
  branch: string;
  domain: string;
  env: Record<string, string>;
}

export default function AppRegistrationSection() {
  const { showToast } = useToast();

  const handleRegisterApp = async (data: AppRegistrationData) => {
    try {
      const response = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to register app');
      showToast('App registered successfully', 'success');
    } catch (error) {
      showToast('Failed to register app', 'error');
    }
  };

  return (
    <section className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 text-black">Register New App</h2>
      <AppRegistrationForm onSubmit={handleRegisterApp} />
    </section>
  );
} 