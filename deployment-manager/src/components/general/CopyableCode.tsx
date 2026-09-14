'use client';

import { useState } from 'react';
import { CheckIcon, ClipboardIcon } from './icons';

interface CopyableCodeProps {
  value: string;
  className?: string;
}

/**
 * The same inline code-badge look used for a value quoted in running text (e.g. a URL to
 * paste into a third-party form) - `font-mono` badge, plus a small copy action at the end.
 * Confirms in place for 2s, same convention as CopyField - never fires a toast.
 *
 * Distinct from CodeToken (which is for a short value elsewhere in the UI, optionally
 * linked) and from CopyField (a boxed, block-level input-style control) - this one is
 * meant to sit inline inside a paragraph of prose.
 */
export default function CopyableCode({ value, className }: CopyableCodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (non-HTTPS context, denied permission) - the
      // value is still right there as selectable text, so fail silently rather than
      // showing an error for something that isn't really broken from the user's view.
    }
  };

  return (
    <span
      className={[
        'inline-flex items-center gap-6 max-w-full font-mono text-meta bg-surface border border-line-token rounded-badge px-5 py-1',
        className ?? '',
      ].join(' ')}
    >
      <span className="truncate">{value}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        className={[
          'inline-flex items-center shrink-0 cursor-pointer border-0 bg-transparent p-0',
          'text-ink-faint transition-colors duration-150 hover:text-ink focus-ring rounded-badge',
          copied ? 'text-success-ink' : '',
        ].join(' ')}
      >
        {copied ? <CheckIcon size={11} /> : <ClipboardIcon size={11} />}
      </button>
    </span>
  );
}
