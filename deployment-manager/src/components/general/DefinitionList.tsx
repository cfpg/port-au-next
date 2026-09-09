interface DefinitionItem {
  label: string;
  value: React.ReactNode;
}

interface DefinitionListProps {
  items: DefinitionItem[];
  columns?: 2 | 3;
  className?: string;
}

/**
 * Read-only. The moment a value becomes editable it's a FieldGroup, not a
 * definition.
 */
export default function DefinitionList({ items, columns = 2, className }: DefinitionListProps) {
  return (
    <div
      className={`grid gap-x-18 gap-y-14 border border-line rounded-menu p-13 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'} ${className ?? ''}`}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <div className="font-display font-semibold text-label mb-4">{item.label}</div>
          <div className="font-mono text-meta text-ink-muted truncate">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
