"use client";

import { tv } from 'tailwind-variants';
import { useState } from 'react';

const input = tv({
  slots: {
    base: '',
    inputContainer: 'relative',
    input: 'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
    label: 'block text-sm font-medium text-gray-700 mb-2',
    toggleButton: 'absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer',
    error: 'mt-1 text-sm text-red-500',
  },
  variants: {
    hasToggle: {
      true: {
        input: 'pr-10',
      },
      false: {},
    },
    hasError: {
      true: {
        input: 'border-red-500 focus:ring-red-500 focus:border-red-500',
      },
      false: {},
    },
  },
  defaultVariants: {
    hasToggle: false,
    hasError: false,
  },
});

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  showToggle?: boolean;
  error?: string;
}

export default function Input({
  className,
  type = 'text',
  label: labelText,
  showToggle = false,
  error,
  ...props
}: InputProps) {
  const [isContentHidden, setIsContentHidden] = useState(showToggle);
  const inputType = showToggle && isContentHidden ? 'password' : type;
  const hasToggle = showToggle;
  const hasError = !!error;

  const styles = input({ hasToggle, hasError, className });

  return (
    <div className={styles.base()}>
      {labelText && (
        <label htmlFor={props.id} className={styles.label()}>
          {labelText}
        </label>
      )}
      <div className={styles.inputContainer()}>
        <input
          type={inputType}
          className={styles.input()}
          {...props}
          autoComplete={showToggle ? 'off' : props.autoComplete}
        />
        {hasToggle && (
          <button
            type="button"
            onClick={() => setIsContentHidden(!isContentHidden)}
            className={styles.toggleButton()}
            tabIndex={-1}
          >
            <i className={`fas ${isContentHidden ? 'fa-eye' : 'fa-eye-slash'}`} />
          </button>
        )}
      </div>
      {error && <div className={styles.error()}>{error}</div>}
    </div>
  );
} 