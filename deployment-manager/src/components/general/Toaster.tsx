'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

export default function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'white',
          color: 'black',
          border: '1px solid #e2e8f0',
        },
      }}
    />
  );
}

// Toast utility function to replace the custom useToast hook
export const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      toast.warning(message);
      break;
    default:
      toast.info(message);
  }
}; 