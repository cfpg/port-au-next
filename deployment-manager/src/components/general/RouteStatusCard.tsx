import Badge, { BadgeTone } from './Badge';

interface RouteStatusRow {
  label: string;
  value: React.ReactNode;
}

interface RouteStatusCardProps {
  title: string;
  hostname?: string | null;
  tone: BadgeTone;
  statusLabel: string;
  description?: string;
  rows: RouteStatusRow[];
  action?: React.ReactNode;
  className?: string;
}

/**
 * A route's problem is stated in its own words - "CNAME missing", not a
 * generic error. Its footer action's variant should match state: primary
 * when something is missing, secondary when already synced.
 */
export default function RouteStatusCard({ title, hostname, tone, statusLabel, description, rows, action, className }: RouteStatusCardProps) {
  return (
    <div className={`border border-line rounded-panel overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-10 px-11 py-8 bg-paper border-b border-line">
        <div>
          <div className="font-display font-semibold text-label">{title}</div>
          {hostname ? <div className="font-mono text-meta text-ink-muted mt-2">{hostname}</div> : null}
        </div>
        <Badge tone={tone}>{statusLabel}</Badge>
      </div>
      {description ? (
        <div className="text-field text-ink-muted px-11 pt-9">{description}</div>
      ) : null}
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex justify-between gap-12 px-11 py-6 ${i < rows.length - 1 ? 'border-b border-line-soft' : ''}`}
        >
          <span className="text-label text-ink-faint">{row.label}</span>
          <span className="font-mono text-meta text-right">{row.value}</span>
        </div>
      ))}
      {action ? <div className="px-11 py-9 bg-paper border-t border-line">{action}</div> : null}
    </div>
  );
}
