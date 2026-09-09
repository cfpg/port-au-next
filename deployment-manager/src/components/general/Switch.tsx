'use client';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  hint?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * The single Enabled/Disabled control. Applies immediately - if a change
 * needs a Save button, it belongs in a Checkbox instead.
 */
export default function Switch({ checked, onChange, disabled, label, hint, className, ...aria }: SwitchProps) {
  const track = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'group shrink-0 relative w-34 h-19 rounded-full border p-0 cursor-pointer',
        'transition-[background-color,border-color] duration-150 focus-ring',
        disabled
          ? 'bg-hover border-line cursor-not-allowed'
          : checked
            ? 'bg-primary border-primary-hover hover:shadow-switch-hover'
            : 'bg-hover border-line-strong hover:shadow-switch-hover',
        className,
      ].join(' ')}
      {...aria}
    >
      <span
        className={[
          'absolute top-1 left-1 w-15 h-15 rounded-full transition-[left] duration-150',
          disabled ? 'bg-paper shadow-knob-off' : 'bg-white shadow-knob',
          checked ? 'left-16' : 'left-1',
        ].join(' ')}
      />
    </button>
  );

  if (!label) return track;

  return (
    <div className="flex items-start justify-between gap-16">
      <div className="min-w-0">
        <div className={`font-display font-semibold text-panel ${disabled ? 'text-ink-faint' : ''}`}>{label}</div>
        {hint ? <div className={`text-field mt-3 leading-[1.5] ${disabled ? 'text-ink-faint' : 'text-ink-muted'}`}>{hint}</div> : null}
      </div>
      {track}
    </div>
  );
}
