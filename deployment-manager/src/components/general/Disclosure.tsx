'use client';

import { useState } from 'react';
import { ChevronDownIcon } from './icons';

interface DisclosureProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Holds reference material - env var names, setup steps. Never hides a
 * control the user needs. Starts closed, and is labelled with what's
 * inside, not "More".
 */
export default function Disclosure({ title, children, className }: DisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border border-line rounded-menu overflow-hidden ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group w-full flex items-center justify-between gap-10 bg-paper border-0 px-13 py-10 cursor-pointer text-left font-sans text-panel text-primary transition-colors duration-100 hover:text-primary-active focus-ring"
      >
        {title}
        <ChevronDownIcon size={14} className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-13 border-t border-line text-panel leading-[1.6] text-ink-muted">
          {children}
        </div>
      )}
    </div>
  );
}
