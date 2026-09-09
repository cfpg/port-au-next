'use client';

import { CheckIcon } from './icons';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

export default function Checkbox({ checked, onChange, disabled, label, className, ...aria }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'inline-flex items-center gap-8 text-panel cursor-pointer focus-ring rounded-badge',
        disabled ? 'text-ink-ghost cursor-not-allowed' : 'text-ink',
        className,
      ].join(' ')}
      {...aria}
    >
      <span
        className={[
          'inline-flex items-center justify-center size-15 rounded-badge border transition-colors duration-150',
          disabled
            ? 'bg-canvas border-line'
            : checked
              ? 'bg-primary border-primary-hover'
              : 'bg-surface border-line-strong hover:border-primary',
        ].join(' ')}
      >
        {checked ? <CheckIcon size={10} className="text-white" /> : null}
      </span>
      {label}
    </button>
  );
}
