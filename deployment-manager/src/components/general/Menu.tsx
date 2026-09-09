'use client';

import { useRef, useState } from 'react';
import { MoreVerticalIcon } from './icons';
import Popover from './Popover';

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={`inline-flex ${className ?? ''}`}>
      <button
        ref={triggerRef}
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
      <Popover
        open={open}
        onOpenChange={setOpen}
        anchorRef={triggerRef}
        placement={align === 'right' ? 'bottom-end' : 'bottom-start'}
      >
        <div role="menu" className="min-w-174 bg-surface border border-line rounded-menu shadow-pop p-4 z-110">
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
      </Popover>
    </div>
  );
}
