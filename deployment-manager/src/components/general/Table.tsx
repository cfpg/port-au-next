import { ChevronDownIcon } from './icons';
import Skeleton from './Skeleton';

export interface TableColumn<T> {
  key: string;
  header: string;
  /** A grid-template-columns track size, e.g. "1.5fr", "88px". */
  width: string;
  align?: 'right';
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  sortKey?: string;
  sortDescending?: boolean;
  onSortChange?: (key: string) => void;
  isLoading?: boolean;
  skeletonRows?: number;
  emptyState?: React.ReactNode;
  className?: string;
}

/**
 * The row-rendering primitive everything else in the kit's list views is
 * built on. Rows are hairline-separated, never striped — hover is the only
 * row background. Long values are the caller's responsibility to truncate.
 */
export default function Table<T>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDescending,
  onSortChange,
  isLoading = false,
  skeletonRows = 5,
  emptyState,
  className,
}: TableProps<T>) {
  const gridTemplateColumns = columns.map((c) => c.width).join(' ');

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <div
        className="grid gap-10 items-center px-13 py-7 bg-paper border-b border-line font-mono text-nano tracking-caps uppercase text-ink-faint"
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => (
          <span key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
            {col.sortable ? (
              <button
                type="button"
                onClick={() => onSortChange?.(col.key)}
                className="group inline-flex items-center gap-4 cursor-pointer transition-colors duration-100 hover:text-ink"
              >
                {col.header}
                <ChevronDownIcon
                  size={10}
                  className={`transition-transform duration-150 ${sortKey === col.key && sortDescending ? 'rotate-180' : ''}`}
                />
              </button>
            ) : (
              col.header
            )}
          </span>
        ))}
      </div>

      {isLoading ? (
        Array.from({ length: skeletonRows }).map((_, i) => (
          <div
            key={i}
            className="grid gap-10 items-center px-13 py-8 border-b border-line-soft"
            style={{ gridTemplateColumns }}
          >
            {columns.map((col) => (
              <Skeleton key={col.key} className="h-8 w-[70%]" />
            ))}
          </div>
        ))
      ) : rows.length === 0 ? (
        emptyState ?? null
      ) : (
        rows.map((row) => (
          <div
            key={rowKey(row)}
            className="grid gap-10 items-center px-13 py-8 border-b border-line-soft transition-colors duration-100 hover:bg-paper"
            style={{ gridTemplateColumns }}
          >
            {columns.map((col) => (
              <div key={col.key} className={col.align === 'right' ? 'flex gap-5 justify-end' : 'min-w-0'}>
                {col.render(row)}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
