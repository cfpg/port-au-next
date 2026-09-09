import { getServiceStatusTone } from '~/utils/serviceColors';
import { Service, ServiceStatus } from '~/types';
import Avatar from '~/components/general/Avatar';
import Badge from '~/components/general/Badge';

interface ServiceCardProps {
  name: string;
  status: string;
  service: Service;
  id: string;
}

/**
 * Read-only — reports, never offers restart or stop. Avatars are neutral,
 * one letter; a colour per service would compete with status colour and win.
 */
export default function ServiceCard({ name, status, service, id }: ServiceCardProps) {
  const shortId = id.slice(0, 8);

  return (
    <div className="bg-surface border border-line rounded-panel shadow-panel overflow-hidden">
      <div className="flex items-center gap-8 px-11 py-8 bg-paper border-b border-line">
        <Avatar name={service} tone="neutral" size="sm" />
        <span className="font-display font-semibold text-field capitalize">{service}</span>
      </div>
      <div className="px-11 py-10">
        <div className="text-mini text-ink-faint mb-3">Container</div>
        <div className="font-mono text-meta text-ink truncate" title={name}>{name}</div>
        <div className="flex items-center justify-between gap-8 mt-9">
          <span className="font-mono text-micro text-ink-faint" title={id}>ID: {shortId}</span>
          <Badge tone={getServiceStatusTone(status as ServiceStatus)} withDot>{status}</Badge>
        </div>
      </div>
    </div>
  );
}
