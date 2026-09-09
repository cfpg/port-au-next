"use client";

import { tv } from '~/lib/tv';
import { useState } from 'react';
import { EyeIcon, EyeOffIcon, AlertCircleIcon } from './icons';

const input = tv({
  slots: {
    base: '',
    inputContainer: 'relative',
    input: [
      'w-full font-mono text-field bg-surface text-ink border border-line-strong rounded-control px-10 py-7',
      'transition-colors duration-150 hover:border-line-stronger placeholder:text-ink-ghost',
      'focus:outline-none focus:border-primary focus:shadow-focus',
    ],
    label: 'text-label text-ink-muted mb-5 block',
    toggleButton: [
      'absolute right-0 top-0 bottom-0 inline-flex items-center justify-center w-32 bg-paper border-0 border-l border-line text-ink-muted cursor-pointer',
      'transition-colors duration-150 hover:bg-hover hover:text-ink focus-ring',
    ],
    error: 'flex items-center gap-5 text-mini text-danger-ink mt-5',
    hint: 'text-mini text-ink-faint mt-5',
  },
  variants: {
    hasToggle: {
      true: { input: 'pr-32' },
    },
    hasError: {
      true: { input: 'border-danger focus:border-danger' },
    },
    disabled: {
      true: { input: 'bg-canvas text-ink-ghost cursor-not-allowed hover:border-line-strong' },
    },
  },
  defaultVariants: {
    hasToggle: false,
    hasError: false,
    disabled: false,
  },
});

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  showToggle?: boolean;
  error?: string;
  hint?: string;
}

export default function Input({
  className,
  type = 'text',
  label: labelText,
  showToggle = false,
  error,
  hint,
  disabled,
  ...props
}: InputProps) {
  const [isContentHidden, setIsContentHidden] = useState(showToggle);
  const inputType = showToggle && isContentHidden ? 'password' : type;
  const hasToggle = showToggle;
  const hasError = !!error;

  const styles = input({ hasToggle, hasError, disabled });

  return (
    <div className={styles.base({ className })}>
      {labelText && (
        <label htmlFor={props.id} className={styles.label()}>
          {labelText}
        </label>
      )}
      <div className={styles.inputContainer()}>
        <input
          type={inputType}
          className={styles.input()}
          disabled={disabled}
          {...props}
          autoComplete={showToggle ? 'off' : props.autoComplete}
        />
        {hasToggle && (
          <button
            type="button"
            onClick={() => setIsContentHidden(!isContentHidden)}
            className={styles.toggleButton()}
            tabIndex={-1}
            aria-label={isContentHidden ? 'Show value' : 'Hide value'}
          >
            {isContentHidden ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        )}
      </div>
      {error ? (
        <div className={styles.error()}>
          <AlertCircleIcon className="shrink-0" />
          {error}
        </div>
      ) : hint ? (
        <div className={styles.hint()}>{hint}</div>
      ) : null}
    </div>
  );
}
