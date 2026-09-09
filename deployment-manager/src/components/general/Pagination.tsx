interface ChevronProps {
  size?: number;
  direction: 'left' | 'right';
}

function Chevron({ size = 12, direction }: ChevronProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={direction === 'left' ? '15 6 9 12 15 18' : '9 6 15 12 9 18'} />
    </svg>
  );
}

interface PaginationProps {
  pageLabel: string;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function Pagination({ pageLabel, onPrev, onNext, hasPrev, hasNext }: PaginationProps) {
  return (
    <div className="flex items-center justify-between gap-10 flex-wrap px-13 py-8 bg-paper border-t border-line">
      <span className="font-mono text-mini text-ink-faint">{pageLabel}</span>
      <div className="flex gap-5 items-center">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="inline-flex items-center gap-5 font-display font-medium text-label bg-surface text-ink border border-line-strong rounded-control px-9 py-4 cursor-pointer transition-colors duration-150 hover:bg-paper hover:border-line-stronger active:bg-hover disabled:text-ink-ghost disabled:cursor-not-allowed focus-ring"
        >
          <Chevron direction="left" />
          Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="inline-flex items-center gap-5 font-display font-medium text-label bg-surface text-ink border border-line-strong rounded-control px-9 py-4 cursor-pointer transition-colors duration-150 hover:bg-paper hover:border-line-stronger active:bg-hover disabled:text-ink-ghost disabled:cursor-not-allowed focus-ring"
        >
          Next
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
}
