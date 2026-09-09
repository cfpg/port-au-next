'use client';

import { cloneElement, useId, useRef, useState } from 'react';
import Popover from './Popover';

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
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {cloneElement(children, { 'aria-describedby': id } as React.HTMLAttributes<HTMLElement>)}
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef} placement="top" dismissOnInteractOutside={false}>
        <span
          id={id}
          role="tooltip"
          className={[
            'block whitespace-nowrap bg-ink text-paper font-mono text-mini rounded-control px-8 py-5 shadow-tip z-110',
            className,
          ].join(' ')}
        >
          {content}
        </span>
      </Popover>
    </span>
  );
}
