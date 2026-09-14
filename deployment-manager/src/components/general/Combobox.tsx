'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { tv } from '~/lib/tv';
import Popover from './Popover';
import { AlertCircleIcon } from './icons';

const combobox = tv({
  slots: {
    base: '',
    inputContainer: 'relative',
    input: [
      'w-full font-mono text-field bg-surface text-ink border border-line-strong rounded-control px-10 py-7',
      'transition-colors duration-150 hover:border-line-stronger placeholder:text-ink-ghost',
      'focus:outline-none focus:border-primary focus:shadow-focus',
    ],
    label: 'text-label text-ink-muted mb-5 block',
    error: 'flex items-center gap-5 text-mini text-danger-ink mt-5',
    hint: 'text-mini text-ink-faint mt-5',
    panel: 'min-w-full max-h-208 overflow-y-auto bg-surface border border-line rounded-menu shadow-pop p-4',
    option: [
      'w-full flex items-center px-9 py-7 rounded-badge text-panel text-left cursor-pointer truncate',
      'transition-colors duration-100',
    ],
    meta: 'px-9 py-7 text-mini text-ink-faint',
  },
  variants: {
    hasError: {
      true: { input: 'border-danger focus:border-danger' },
    },
    disabled: {
      true: { input: 'bg-canvas text-ink-ghost cursor-not-allowed hover:border-line-strong' },
    },
    highlighted: {
      true: { option: 'bg-hover text-ink' },
      false: { option: 'text-ink hover:bg-hover' },
    },
  },
  defaultVariants: {
    hasError: false,
    disabled: false,
    highlighted: false,
  },
});

interface ComboboxProps {
  id?: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Suggestions to filter and show below the input as the user types. Always optional,
   * never required for the field to work - this stays a plain free-text input (identical
   * to Input) when `options` is empty and `loading`/`emptyMessage` are both unset, which is
   * exactly the fallback a caller with nothing to suggest yet (or ever) wants.
   */
  options?: string[];
  /** Shows a "Loading..." row in the suggestion panel instead of "No matches" while fetching. */
  loading?: boolean;
  /** Shown in the panel when `options` is non-empty overall but nothing matches the typed text, or when `options` is empty and this is set (e.g. "GitHub not connected"). Leave unset to suppress the panel entirely when there's nothing to suggest. */
  emptyMessage?: string;
  placeholder?: string;
  hint?: React.ReactNode;
  error?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_VISIBLE_OPTIONS = 50;

/**
 * A free-text input with optional type-ahead suggestions - never a closed picker. Typing
 * always updates `value` directly (there is no "must pick from the list" state), so a
 * caller with nothing to suggest (or a still-loading list) degrades to exactly a plain
 * text input, never a dead end. Built on Popover for the suggestion panel's positioning/
 * dismissal, the same primitive Menu uses, so this stays consistent with every other
 * floating panel in the app instead of reinventing outside-click/Escape handling.
 */
export default function Combobox({
  id,
  name,
  label: labelText,
  value,
  onChange,
  options = [],
  loading = false,
  emptyMessage,
  placeholder,
  hint,
  error,
  disabled = false,
  className,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matches = query ? options.filter((option) => option.toLowerCase().includes(query)) : options;
    return matches.slice(0, MAX_VISIBLE_OPTIONS);
  }, [options, value]);

  const hasError = !!error;
  const showPanel = open && (loading || filteredOptions.length > 0 || !!emptyMessage);
  const styles = combobox({ hasError, disabled });

  const selectOption = (option: string) => {
    onChange(option);
    setOpen(false);
    setHighlightedIndex(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (!filteredOptions.length) return;
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) =>
        current === null || current >= filteredOptions.length - 1 ? 0 : current + 1
      );
    } else if (event.key === 'ArrowUp') {
      if (!filteredOptions.length) return;
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) =>
        current === null || current <= 0 ? filteredOptions.length - 1 : current - 1
      );
    } else if (event.key === 'Enter') {
      if (open && highlightedIndex !== null && filteredOptions[highlightedIndex]) {
        event.preventDefault();
        selectOption(filteredOptions[highlightedIndex]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(null);
    }
  };

  return (
    <div className={styles.base({ className })}>
      {labelText && (
        <label htmlFor={inputId} className={styles.label()}>
          {labelText}
        </label>
      )}
      <div className={styles.inputContainer()}>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlightedIndex !== null ? `${listboxId}-option-${highlightedIndex}` : undefined
          }
          autoComplete="off"
          className={styles.input()}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setHighlightedIndex(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <Popover open={showPanel} onOpenChange={setOpen} anchorRef={inputRef} placement="bottom-start">
        <div id={listboxId} role="listbox" style={{ width: inputRef.current?.offsetWidth }} className={styles.panel()}>
          {filteredOptions.map((option, index) => (
            <button
              key={option}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseEnter={() => setHighlightedIndex(index)}
              // onMouseDown (not onClick) fires before the input's onBlur, so selecting an
              // option doesn't first close the panel out from under the click.
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
              className={styles.option({ highlighted: index === highlightedIndex })}
            >
              {option}
            </button>
          ))}
          {!filteredOptions.length && loading && <div className={styles.meta()}>Loading…</div>}
          {!filteredOptions.length && !loading && emptyMessage && <div className={styles.meta()}>{emptyMessage}</div>}
        </div>
      </Popover>
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
