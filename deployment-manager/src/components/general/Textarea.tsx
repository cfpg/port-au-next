"use client";

import { tv } from '~/lib/tv';
import { AlertCircleIcon } from './icons';

const textarea = tv({
  slots: {
    base: '',
    textarea: [
      'w-full font-mono text-field bg-surface text-ink border border-line-strong rounded-control px-10 py-7',
      'transition-colors duration-150 hover:border-line-stronger placeholder:text-ink-ghost',
      'focus:outline-none focus:border-primary focus:shadow-focus',
    ],
    label: 'text-label text-ink-muted mb-5 block',
    error: 'flex items-center gap-5 text-mini text-danger-ink mt-5',
    hint: 'text-mini text-ink-faint mt-5',
  },
  variants: {
    hasError: {
      true: { textarea: 'border-danger focus:border-danger' },
    },
    disabled: {
      true: { textarea: 'bg-canvas text-ink-ghost cursor-not-allowed hover:border-line-strong' },
    },
  },
  defaultVariants: {
    hasError: false,
    disabled: false,
  },
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Textarea({
  className,
  label: labelText,
  error,
  hint,
  disabled,
  ...props
}: TextareaProps) {
  const hasError = !!error;
  const styles = textarea({ hasError, disabled });

  return (
    <div className={styles.base({ className })}>
      {labelText && (
        <label htmlFor={props.id} className={styles.label()}>
          {labelText}
        </label>
      )}
      <textarea className={styles.textarea()} disabled={disabled} {...props} />
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
