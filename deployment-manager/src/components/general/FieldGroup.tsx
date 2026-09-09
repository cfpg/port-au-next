interface FieldGroupProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Responsive field grid - two columns max in practice, since the min track
 * is 220px. A field that holds a path or URL should get `className="col-span-full"`
 * directly on the field (Input/Select both forward className to their wrapper).
 */
export default function FieldGroup({ children, className }: FieldGroupProps) {
  return (
    <div className={`grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-14 ${className ?? ''}`}>
      {children}
    </div>
  );
}
