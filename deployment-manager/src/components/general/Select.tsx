"use client";

import { tv } from 'tailwind-variants';

const select = tv({
  slots: {
    base: '',
    selectContainer: 'relative',
    select: 'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm',
    label: 'block text-sm font-medium text-gray-700 mb-2',
    error: 'mt-1 text-sm text-red-500',
  },
  variants: {
    hasError: {
      true: {
        select: 'border-red-500 focus:ring-red-500 focus:border-red-500',
      },
      false: {},
    },
    disabled: {
      true: {
        select: 'bg-gray-50 cursor-not-allowed',
      },
      false: {},
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
      </div>
      {error && <div className={styles.error()}>{error}</div>}
    </div>
  );
} 