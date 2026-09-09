'use client';

import { cloneElement, useId, useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  className?: string;
}

/**
 * Explains, never informs - if the content is required to use a feature it
 * belongs on the page, not in here. Mandatory on every icon-only button and
 * every disabled control.
 */
export default function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {cloneElement(children, { 'aria-describedby': id } as React.HTMLAttributes<HTMLElement>)}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={[
            'absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap',
            'bg-ink text-paper font-mono text-mini rounded-control px-8 py-5 shadow-tip z-20',
            className,
          ].join(' ')}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
