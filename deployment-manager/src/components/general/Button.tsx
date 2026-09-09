"use client";

import { tv } from '~/lib/tv';
import { VariantProps } from 'tailwind-variants';
import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, SpinnerIcon } from './icons';

export const buttonStyles = tv({
  slots: {
    wrapper: 'inline-flex relative',
    base: [
      'inline-flex items-center justify-center gap-6 font-display cursor-pointer whitespace-nowrap',
      'rounded-control transition-colors duration-150 focus-ring',
      'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-ghost disabled:border-line',
    ],
    dropdownButton: [
      'inline-flex items-center justify-center cursor-pointer',
      'rounded-r-control transition-colors duration-150 focus-ring',
    ],
    dropdownPanel: 'absolute top-[calc(100%+5px)] left-0 min-w-190 bg-surface border border-line rounded-menu shadow-pop p-4 z-20',
    dropdownItem: [
      'w-full flex items-center gap-9 px-9 py-7 rounded-badge text-panel text-ink text-left cursor-pointer',
      'transition-colors duration-100 hover:bg-hover active:bg-pressed',
    ],
  },
  variants: {
    variant: {
      primary: {
        base: 'font-semibold bg-primary text-white border border-primary-hover hover:bg-primary-hover hover:border-primary-active active:bg-primary-active active:border-primary-active',
        dropdownButton: 'bg-primary-hover text-white border border-primary-hover hover:bg-primary-active hover:border-primary-active active:bg-primary-pressed',
      },
      secondary: {
        base: 'font-medium bg-surface text-ink border border-line-strong hover:bg-paper hover:border-line-stronger active:bg-hover',
        dropdownButton: 'bg-surface text-ink-muted border border-line-strong hover:bg-paper hover:border-line-stronger active:bg-hover',
      },
      ghost: {
        base: 'font-medium bg-transparent text-primary border border-transparent hover:bg-primary-tint hover:text-primary-active active:bg-primary-tint-hover disabled:bg-transparent',
        dropdownButton: 'bg-transparent text-primary border border-transparent hover:bg-primary-tint hover:text-primary-active active:bg-primary-tint-hover',
      },
      danger: {
        base: 'font-medium bg-surface text-ink-muted border border-line-strong hover:bg-danger-tint hover:border-danger-line-strong hover:text-danger-ink active:bg-danger-tint-hover active:border-danger-line-stronger active:text-danger-pressed',
        dropdownButton: 'bg-surface text-ink-muted border border-line-strong hover:bg-danger-tint hover:border-danger-line-strong hover:text-danger-ink active:bg-danger-tint-hover',
      },
      'danger-solid': {
        base: 'font-semibold bg-danger-solid text-white border border-danger-ink hover:bg-danger-pressed',
        dropdownButton: 'bg-danger-solid text-white border border-danger-ink hover:bg-danger-pressed',
      },
    },
    size: {
      sm: { base: 'text-label px-10 py-5', dropdownButton: 'px-7 py-5' },
      md: { base: 'text-panel px-14 py-8', dropdownButton: 'px-8 py-8' },
    },
    iconOnly: {
      true: { base: 'size-26 p-0' },
    },
    hasDropdown: {
      true: { base: 'rounded-r-none border-r-0' },
    },
  },
  defaultVariants: {
    variant: 'secondary',
    size: 'md',
  },
});

interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    Omit<VariantProps<typeof buttonStyles>, 'hasDropdown'> {
  children: React.ReactNode;
  dropdown?: DropdownItem[];
  /** Shows an inline spinner in place of any leading icon; label stays put so the control doesn't resize. */
  loading?: boolean;
}

export default function Button({
  variant,
  size,
  iconOnly,
  className,
  children,
  disabled,
  loading,
  dropdown,
  onClick,
  ...props
}: ButtonProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const isDisabled = disabled || loading;
  const styles = buttonStyles({ variant, size, iconOnly });
  const spinnerClassName = variant === 'primary' || variant === 'danger-solid'
    ? 'border-white/35 border-t-white'
    : 'border-line-strong border-t-ink-muted';

  if (!dropdown) {
    return (
      <button
        className={styles.base({ className })}
        disabled={isDisabled}
        onClick={onClick}
        {...props}
      >
        {loading ? <SpinnerIcon className={spinnerClassName} /> : null}
        {children}
      </button>
    );
  }

  return (
    <div className={styles.wrapper({ className })} ref={dropdownRef}>
      <button
        className={buttonStyles({ variant, size, hasDropdown: true }).base()}
        disabled={isDisabled}
        onClick={onClick}
        {...props}
      >
        {loading ? <SpinnerIcon className={spinnerClassName} /> : null}
        {children}
      </button>
      <button
        type="button"
        className={styles.dropdownButton()}
        onClick={(e) => {
          e.stopPropagation();
          setIsDropdownOpen(!isDropdownOpen);
        }}
        disabled={isDisabled}
        aria-label="More deploy options"
      >
        <ChevronDownIcon size={13} />
      </button>
      {isDropdownOpen && (
        <div className={styles.dropdownPanel()}>
          {dropdown.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                item.onClick();
                setIsDropdownOpen(false);
              }}
              className={styles.dropdownItem()}
              role="menuitem"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
