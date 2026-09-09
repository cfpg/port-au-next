'use client';

import { useEffect } from 'react';
import { tv, VariantProps } from 'tailwind-variants';

const modal = tv({
  slots: {
    backdrop: 'fixed inset-0 bg-ink/35 backdrop-blur-[1.5px] flex items-center justify-center p-24 z-100 animate-overlay-in',
    container: 'w-full bg-surface border border-line rounded-panel shadow-modal overflow-hidden animate-modal-in flex flex-col',
    header: 'flex items-center justify-between gap-10 px-14 py-11 border-b border-line',
    title: 'font-display font-semibold text-body',
    closeButton: 'inline-flex items-center justify-center size-24 bg-transparent border-0 rounded-control text-ink-faint cursor-pointer transition-colors duration-150 hover:bg-hover hover:text-ink focus-ring',
    content: 'p-14 overflow-y-auto flex-1',
  },
  variants: {
    size: {
      sm: { container: 'max-w-380 max-h-[90vh]' },
      md: { container: 'max-w-450 max-h-[90vh]' },
      lg: { container: 'max-w-600 max-h-[90vh]' },
      xl: { container: 'max-w-720 max-h-[90vh]' },
      '2xl': { container: 'max-w-840 max-h-[90vh]' },
      '3xl': { container: 'max-w-960 max-h-[90vh]' },
      logs: {
        backdrop: 'p-12',
        container: 'max-w-[1600px] h-[calc(100dvh-24px)] max-h-[calc(100dvh-24px)] min-h-0',
        content: 'p-14 overflow-hidden flex-1 min-h-0 flex flex-col',
      },
    },
  },
  defaultVariants: {
    size: '2xl',
  },
});

interface ModalProps extends VariantProps<typeof modal> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * For a decision or a short form — never for content you'd want to keep
 * open while working. Escape and backdrop-click close it (destructive
 * confirmations should use ConfirmDialog instead, which disables both).
 */
export default function Modal({ isOpen, onClose, title, children, size, className }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { backdrop, container, header, title: titleStyles, closeButton, content } = modal({ size, className });

  return (
    <div className={backdrop()} onClick={onClose}>
      <div className={container()} onClick={(e) => e.stopPropagation()}>
        <div className={header()}>
          <span className={titleStyles()}>{title}</span>
          <button type="button" onClick={onClose} className={closeButton()} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className={content()}>
          {children}
        </div>
      </div>
    </div>
  );
}
