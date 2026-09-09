'use client';

import { useState } from 'react';

export interface TabItem {
  key: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  defaultKey?: string;
  className?: string;
}

/**
 * Switches views of one resource, never navigates elsewhere. 2-4 tabs —
 * more means a sidebar.
 */
export default function Tabs({ items, defaultKey, className }: TabsProps) {
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);
  const activeItem = items.find((item) => item.key === active) ?? items[0];

  return (
    <div className={`border border-line rounded-panel overflow-hidden ${className ?? ''}`}>
      <div className="flex gap-2 px-9 pt-7 bg-paper border-b border-line" role="tablist">
        {items.map((item) => {
          const isActive = item.key === activeItem?.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(item.key)}
              className={[
                'relative top-1 font-display font-semibold text-field rounded-t-control px-13 py-7 cursor-pointer border border-b-0',
                'transition-colors duration-100 focus-ring',
                isActive ? 'bg-surface text-ink border-line' : 'bg-transparent border-transparent text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="p-14" role="tabpanel">
        {activeItem?.content}
      </div>
    </div>
  );
}
