"use client";

import { tv } from 'tailwind-variants';
import { ChevronDownIcon } from './icons';

const select = tv({
  slots: {
    base: '',
    selectContainer: 'relative',
    select: [
      'w-full appearance-none font-mono text-field bg-surface text-ink border border-line-strong rounded-control pl-10 pr-28 py-7',
      'transition-colors duration-150 hover:border-line-stronger',
      'focus:outline-none focus:border-primary focus:shadow-focus',
    ],
    chevron: 'pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 text-ink-faint',
    label: 'text-label text-ink-muted mb-5 block',
    error: 'text-mini text-danger-ink mt-5',
  },
  variants: {
    hasError: {
      true: { select: 'border-danger focus:border-danger' },
    },
    disabled: {
      true: { select: 'bg-canvas text-ink-ghost cursor-not-allowed hover:border-line-strong' },
    },
  },
  defaultVariants: {
    hasError: false,
    disabled: false,
  },
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{
    value: string;
    label: string;
  }>;
}

export default function Select({
  className,
  label: labelText,
  error,
  disabled,
  options,
  ...props
}: SelectProps) {
  const hasError = !!error;

  const styles = select({ hasError, disabled });

  return (
    <div className={styles.base({ className })}>
      {labelText && (
        <label htmlFor={props.id} className={styles.label()}>
          {labelText}
        </label>
      )}
      <div className={styles.selectContainer()}>
        <select
          className={styles.select()}
          disabled={disabled}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon size={13} className={styles.chevron()} />
      </div>
      {error && <div className={styles.error()}>{error}</div>}
    </div>
  );
}
