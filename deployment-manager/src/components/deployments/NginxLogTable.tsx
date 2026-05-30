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
  'px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-200 bg-gray-50';
const tdClass = 'px-3 py-2 text-xs text-gray-800 align-top break-words border-b border-gray-100';

interface NginxLogTableProps {
  content: string;
  variant: 'access' | 'error';
}

export default function NginxLogTable({ content, variant }: NginxLogTableProps) {
  const rows = parseLogLines(content ?? '', variant);

  if (rows.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8 text-sm">(empty log file)</p>
    );
  }

  if (variant === 'access') {
    return <AccessLogTable rows={rows} />;
  }

  return <ErrorLogTable rows={rows} />;
}

function AccessLogTable({ rows }: { rows: ParsedLogRow[] }) {
  return (
    <table className="w-full text-xs table-auto border-collapse">
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
      <tbody className="bg-white">
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
    <tr className="hover:bg-gray-50/80">
      <td className={`${tdClass} font-mono whitespace-nowrap`}>{row.time}</td>
      <td className={`${tdClass} font-mono`}>{row.ip}</td>
      <td className={tdClass}>{row.method}</td>
      <td className={`${tdClass} font-mono`}>{row.path}</td>
      <td className={tdClass}>
        <span className={getHttpStatusClass(row.status)}>{row.status}</span>
      </td>
      <td className={`${tdClass} font-mono tabular-nums`}>{row.size}</td>
      <td className={tdClass}>{row.referrer || '—'}</td>
      <td className={tdClass}>{row.userAgent || '—'}</td>
    </tr>
  );
}

function ErrorLogTable({ rows }: { rows: ParsedLogRow[] }) {
  return (
    <table className="w-full text-xs table-auto border-collapse">
      <thead className="sticky top-0 z-10">
        <tr>
          <th className={thClass}>Time</th>
          <th className={thClass}>Level</th>
          <th className={thClass}>Message</th>
        </tr>
      </thead>
      <tbody className="bg-white">
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
    <tr className="hover:bg-gray-50/80">
      <td className={`${tdClass} font-mono whitespace-nowrap`}>{row.time}</td>
      <td className={tdClass}>
        <span className={getErrorLevelClass(row.level)}>{row.level}</span>
      </td>
      <td className={`${tdClass} font-mono`}>{row.message}</td>
    </tr>
  );
}

function RawRow({ raw, colSpan }: { raw: string; colSpan: number }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={colSpan} className={`${tdClass} font-mono text-gray-600`}>
        {raw}
      </td>
    </tr>
  );
}
