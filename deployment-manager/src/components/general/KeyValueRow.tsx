interface KeyValueItem {
  label: string;
  value: React.ReactNode;
}

interface KeyValueRowProps {
  title: string;
  /** Goes in the header, next to the title - a StatusBadge, typically. Never on individual rows. */
  status?: React.ReactNode;
  rows: KeyValueItem[];
  footer?: React.ReactNode;
  className?: string;
}

/** Labels are sans and quiet; values are mono and dark. Never bold both. */
export default function KeyValueRow({ title, status, rows, footer, className }: KeyValueRowProps) {
  return (
    <div className={`border border-line rounded-menu overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-10 px-11 py-7 bg-paper border-b border-line">
        <span className="font-display font-semibold text-label">{title}</span>
        {status}
      </div>
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex justify-between gap-12 px-11 py-6 ${i < rows.length - 1 ? 'border-b border-line-soft' : ''}`}
        >
          <span className="text-label text-ink-faint">{row.label}</span>
          <span className="font-mono text-meta">{row.value}</span>
        </div>
      ))}
      {footer ? <div className="px-11 py-9 bg-paper border-t border-line">{footer}</div> : null}
    </div>
  );
}
