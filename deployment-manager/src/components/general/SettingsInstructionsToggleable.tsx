"use client";

import { useState } from 'react';
import { tv } from 'tailwind-variants';

const settingsInstructions = tv({
  slots: {
    container: 'transition-all duration-200 ease-in-out overflow-hidden mt-4',
    content: 'bg-blue-50 p-4 rounded-md',
    toggleButton: 'text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2 cursor-pointer',
    icon: 'transition-transform duration-200',
  },
  variants: {
    isExpanded: {
      true: {
        container: 'max-h-[500px]',
        icon: 'rotate-180',
      },
      false: {
        container: 'max-h-0',
      },
    },
  },
  defaultVariants: {
    isExpanded: false,
  },
});

interface SettingsInstructionsToggleableProps {
  children: React.ReactNode;
  title: string;
}

export default function SettingsInstructionsToggleable({
  children,
  title,
}: SettingsInstructionsToggleableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const styles = settingsInstructions({ isExpanded });

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={styles.toggleButton()}
      >
        <span>{title}</span>
        <i className={`fas fa-chevron-down ${styles.icon()}`} />
      </button>
      <div className={styles.container()}>
        <div className={styles.content()}>
          {children}
        </div>
      </div>
    </div>
  );
} 