'use client';

import { useState } from 'react';
import Toast from './Toast';
import React from 'react';

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContainerProps {
  children: React.ReactNode;
}

export default function ToastContainer({ children }: ToastContainerProps) {
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: ToastState['type'] = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 5000);
  };

  // Expose showToast to children through context
  const value = { showToast };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ show: false, message: '', type: 'info' })}
        />
      )}
    </ToastContext.Provider>
  );
}

// Create a context for the toast functionality
export const ToastContext = React.createContext<{
  showToast: (message: string, type?: ToastState['type']) => void;
}>({
  showToast: () => {},
});

// Create a hook to use the toast functionality
export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastContainer');
  }
  return context;
}; 