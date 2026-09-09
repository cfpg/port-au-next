'use client';

import { useState } from 'react';
import { CheckIcon } from './icons';

interface IconType {
  size?: number;
}

function ClipboardIcon({ size = 13 }: IconType) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

interface CopyFieldProps {
  label?: string;
  value: string;
  /** Icon-only trigger instead of the icon + "Copy"/"Copied" label. */
  compact?: boolean;
  className?: string;
}

/**
 * For anything nobody would retype. The button confirms in place for 2s —
 * it never fires a toast.
 */
export default function CopyField({ label, value, compact = false, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={className}>
      {label ? <div className="text-label text-ink-muted mb-5">{label}</div> : null}
      <div className="flex items-stretch bg-surface border border-line-strong rounded-control overflow-hidden">
        <span className="flex-1 min-w-0 font-mono text-label px-10 py-7 text-ink truncate">{value}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy to clipboard"
          className={[
            'inline-flex items-center gap-5 bg-paper border-0 border-l border-line text-ink-muted font-mono text-mini cursor-pointer',
            'transition-colors duration-150 hover:bg-hover hover:text-ink focus-ring',
            compact ? 'justify-center w-32' : 'px-10',
            copied ? 'text-success-ink' : '',
          ].join(' ')}
        >
          {copied ? <CheckIcon size={13} /> : <ClipboardIcon size={13} />}
          {compact ? null : copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
