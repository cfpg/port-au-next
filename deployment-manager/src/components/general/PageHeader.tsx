interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Carries one primary action — the verb for the whole page. Row-level verbs
 * stay in rows. The title is the page's own name, never a restatement of
 * the nav item that led here.
 */
export default function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-14 flex-wrap mb-16 ${className ?? ''}`}>
      <div>
        <h1 className="font-display font-bold text-page tracking-title m-0">{title}</h1>
        {subtitle ? <div className="text-field text-ink-muted mt-4">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}
