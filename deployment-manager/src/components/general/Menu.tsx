'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVerticalIcon } from './icons';

export interface MenuItemDef {
  type?: 'item' | 'separator';
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  items: MenuItemDef[];
  align?: 'left' | 'right';
  ariaLabel?: string;
  className?: string;
}

/**
 * Everything a row can do that isn't its primary action. Destructive item
 * last, below a separator, red text - never a red background. Max ~6 items;
 * beyond that it's a settings page, not a menu.
 */
export default function Menu({ items, align = 'right', ariaLabel = 'More actions', className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className={`relative inline-flex ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'inline-flex items-center justify-center size-26 bg-surface text-ink-muted border border-line-strong rounded-control cursor-pointer',
          'transition-colors duration-150 hover:bg-paper hover:border-line-stronger hover:text-ink focus-ring',
        ].join(' ')}
      >
        <MoreVerticalIcon />
      </button>
      {open && (
        <div
          role="menu"
          className={[
            'absolute top-[calc(100%+4px)] min-w-174 bg-surface border border-line rounded-menu shadow-pop p-4 z-30',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          {items.map((item, index) =>
            item.type === 'separator' ? (
              <div key={index} className="h-1 bg-line-soft my-4" />
            ) : (
              <button
                key={index}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick?.();
                  setOpen(false);
                }}
                className={[
                  'w-full flex items-center gap-9 px-9 py-7 rounded-badge text-panel text-left cursor-pointer',
                  'transition-colors duration-100',
                  item.disabled
                    ? 'text-ink-ghost cursor-not-allowed'
                    : item.danger
                      ? 'text-danger-ink hover:bg-danger-tint active:bg-danger-tint-hover'
                      : 'text-ink hover:bg-hover active:bg-pressed',
                ].join(' ')}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
