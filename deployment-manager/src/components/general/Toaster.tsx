'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: [
            'w-full flex items-start gap-9 bg-surface border border-line border-l-3 rounded-control px-11 py-9 shadow-toast',
            'font-sans text-ink',
          ].join(' '),
          title: 'font-display font-semibold text-field',
          description: 'text-label text-ink-muted mt-2',
          icon: 'shrink-0 mt-1',
          success: 'border-l-success',
          error: 'border-l-danger',
          warning: 'border-l-warning',
          info: 'border-l-primary',
        },
      }}
    />
  );
}

// Toast utility function to replace the custom useToast hook
export const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
  switch (type) {
    case 'success':
      toast.success(message, { duration: 4000 });
      break;
    case 'error':
      toast.error(message, { duration: Infinity });
      break;
    case 'warning':
      toast.warning(message);
      break;
    default:
      toast.info(message);
  }
};
