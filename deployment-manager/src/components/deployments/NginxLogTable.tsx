'use client';

import {
  getErrorLevelClass,
  getHttpStatusClass,
  parseLogLines,
  type ParsedAccessLogRow,
  type ParsedErrorLogRow,
  type ParsedLogRow,
} from '~/lib/parseNginxLogLines';

const thClass =
  'px-9 py-7 text-left font-mono text-nano font-semibold text-ink-faint uppercase tracking-caps border-b border-line bg-paper';
const tdClass = 'px-9 py-7 font-mono text-mini text-ink align-top break-words border-b border-line-soft';

interface NginxLogTableProps {
  content: string;
  variant: 'access' | 'error';
}

export default function NginxLogTable({ content, variant }: NginxLogTableProps) {
  const rows = parseLogLines(content ?? '', variant);

  if (rows.length === 0) {
    return (
      <p className="text-ink-faint text-center py-24 text-field">(empty log file)</p>
    );
  }

  if (variant === 'access') {
    return <AccessLogTable rows={rows} />;
  }

  return <ErrorLogTable rows={rows} />;
}

function AccessLogTable({ rows }: { rows: ParsedLogRow[] }) {
  return (
    <table className="w-full text-mini table-auto border-collapse">
      <thead className="sticky top-0 z-10">
        <tr>
          <th className={thClass}>Time</th>
          <th className={thClass}>IP</th>
          <th className={thClass}>Method</th>
          <th className={thClass}>Path</th>
          <th className={thClass}>Status</th>
          <th className={thClass}>Size</th>
          <th className={thClass}>Referrer</th>
          <th className={thClass}>User agent</th>
        </tr>
      </thead>
      <tbody className="bg-surface">
        {rows.map((row, index) =>
          row.kind === 'access' ? (
            <AccessRow key={`${row.time}-${index}`} row={row} />
          ) : (
            <RawRow key={`raw-${index}`} colSpan={8} raw={row.raw} />
          )
        )}
      </tbody>
    </table>
  );
}

function AccessRow({ row }: { row: ParsedAccessLogRow }) {
  return (
    <tr className="transition-colors duration-100 hover:bg-paper">
      <td className={`${tdClass} whitespace-nowrap`}>{row.time}</td>
      <td className={tdClass}>{row.ip}</td>
      <td className={`${tdClass} font-sans`}>{row.method}</td>
      <td className={tdClass}>{row.path}</td>
      <td className={`${tdClass} font-sans`}>
        <span className={getHttpStatusClass(row.status)}>{row.status}</span>
      </td>
      <td className={`${tdClass} tabular-nums`}>{row.size}</td>
      <td className={`${tdClass} font-sans`}>{row.referrer || '-'}</td>
      <td className={`${tdClass} font-sans`}>{row.userAgent || '-'}</td>
    </tr>
  );
}

function ErrorLogTable({ rows }: { rows: ParsedLogRow[] }) {
  return (
    <table className="w-full text-mini table-auto border-collapse">
      <thead className="sticky top-0 z-10">
        <tr>
          <th className={thClass}>Time</th>
          <th className={thClass}>Level</th>
          <th className={thClass}>Message</th>
        </tr>
      </thead>
      <tbody className="bg-surface">
        {rows.map((row, index) =>
          row.kind === 'error' ? (
            <ErrorRow key={`${row.time}-${index}`} row={row} />
          ) : (
            <RawRow key={`raw-${index}`} colSpan={3} raw={row.raw} />
          )
        )}
      </tbody>
    </table>
  );
}

function ErrorRow({ row }: { row: ParsedErrorLogRow }) {
  return (
    <tr className="transition-colors duration-100 hover:bg-paper">
      <td className={`${tdClass} whitespace-nowrap`}>{row.time}</td>
      <td className={`${tdClass} font-sans`}>
        <span className={getErrorLevelClass(row.level)}>{row.level}</span>
      </td>
      <td className={tdClass}>{row.message}</td>
    </tr>
  );
}

function RawRow({ raw, colSpan }: { raw: string; colSpan: number }) {
  return (
    <tr className="bg-paper">
      <td colSpan={colSpan} className={`${tdClass} text-ink-faint`}>
        {raw}
      </td>
    </tr>
  );
}
