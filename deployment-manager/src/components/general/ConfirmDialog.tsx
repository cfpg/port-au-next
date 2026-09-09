'use client';

import { useState } from 'react';
import Button from './Button';
import Input from './Input';
import Callout from './Callout';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  /** Verb-first, e.g. "Delete app" - never "Confirm". */
  confirmLabel: string;
  /** When set, the confirm button stays disabled until the user types this exact value. */
  confirmText?: string;
  isLoading?: boolean;
  error?: string;
}

/**
 * The only place bg-danger-solid appears. Deliberately not dismissible by
 * backdrop-click or Escape - a destructive action needs an explicit choice,
 * not an accidental one.
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  confirmText,
  isLoading = false,
  error,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    if (isLoading) return;
    setTyped('');
    onClose();
  };

  const canConfirm = !isLoading && (!confirmText || typed === confirmText);

  return (
    <div className="fixed inset-0 bg-ink/35 backdrop-blur-[1.5px] flex items-center justify-center p-24 z-100 animate-overlay-in">
      <div className="w-full max-w-400 bg-surface border border-line rounded-panel shadow-modal overflow-hidden animate-modal-in">
        <div className="flex items-center justify-between gap-10 px-14 py-11 border-b border-line">
          <span className="font-display font-semibold text-body">{title}</span>
        </div>
        <div className="p-14 flex flex-col gap-11">
          <div className="text-panel leading-[1.55] text-ink-muted">{description}</div>
          {confirmText ? (
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isLoading}
              placeholder={confirmText}
              aria-label={`Type ${confirmText} to confirm`}
            />
          ) : null}
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>
        <div className="flex justify-end gap-7 px-14 py-10 bg-paper border-t border-line">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="danger-solid"
            onClick={onConfirm}
            disabled={!canConfirm}
            loading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
