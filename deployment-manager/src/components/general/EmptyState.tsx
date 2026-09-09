interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Says what will fill it, and offers the action that does — no shrugging
 * illustrations. Use inside a Panel's body (flush or padded).
 */
export default function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-8 px-16 py-26 border border-dashed border-line-dash rounded-menu bg-paper ${className ?? ''}`}>
      {icon ? <span className="text-ink-wisp">{icon}</span> : null}
      <div className="font-display font-semibold text-body">{title}</div>
      {description ? (
        <div className="text-field text-ink-muted text-center max-w-330 leading-[1.55]">{description}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
