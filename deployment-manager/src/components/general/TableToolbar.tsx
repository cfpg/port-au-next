'use client';

interface SearchIconProps {
  size?: number;
}

function SearchIcon({ size = 13 }: SearchIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16" y1="16" x2="21" y2="21" />
    </svg>
  );
}

export interface TableFilter {
  key: string;
  label: string;
}

interface TableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: TableFilter[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
  resultLabel?: string;
}

/** Appears at 10+ rows — below that it's noise. */
export default function TableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filter…',
  filters,
  activeFilter,
  onFilterChange,
  resultLabel,
}: TableToolbarProps) {
  return (
    <div className="flex items-center gap-10 flex-wrap px-13 py-9 border-b border-line bg-surface">
      <div className="relative grow shrink basis-190 min-w-150">
        <span className="absolute left-9 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
          <SearchIcon />
        </span>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full font-mono text-field bg-surface text-ink border border-line-strong rounded-control py-6 pl-27 pr-10 transition-colors duration-150 hover:border-line-stronger focus:outline-none focus:border-primary focus:shadow-focus placeholder:text-ink-ghost"
        />
      </div>
      {filters && filters.length > 0 ? (
        <div className="flex gap-5 flex-wrap">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => onFilterChange?.(filter.key)}
              data-on={activeFilter === filter.key}
              className="font-mono text-mini rounded-badge px-9 py-4 cursor-pointer border bg-surface text-ink-muted border-line-strong transition-colors duration-100 hover:border-line-stronger hover:text-ink data-[on=true]:bg-primary-tint data-[on=true]:text-primary-active data-[on=true]:border-primary-line focus-ring"
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
      {resultLabel ? <span className="font-mono text-mini text-ink-faint ml-auto">{resultLabel}</span> : null}
    </div>
  );
}
