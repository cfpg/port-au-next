export type ParsedAccessLogRow = {
  kind: 'access';
  raw: string;
  time: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  size: string;
  referrer: string;
  userAgent: string;
};

export type ParsedErrorLogRow = {
  kind: 'error';
  raw: string;
  time: string;
  level: string;
  message: string;
};

export type ParsedRawLogRow = {
  kind: 'raw';
  raw: string;
};

export type ParsedLogRow = ParsedAccessLogRow | ParsedErrorLogRow | ParsedRawLogRow;

const NGINX_COMBINED =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"$/;

const NGINX_ERROR =
  /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(.+)$/;

function parseRequestLine(request: string): { method: string; path: string } {
  const match = request.match(/^(\S+)\s+(\S+)\s+\S+$/);
  if (!match) {
    return { method: '—', path: request || '—' };
  }
  return { method: match[1], path: match[2] };
}

export function parseAccessLogLine(line: string): ParsedLogRow {
  const trimmed = line.trim();
  if (!trimmed) {
    return { kind: 'raw', raw: line };
  }

  const match = trimmed.match(NGINX_COMBINED);
  if (!match) {
    return { kind: 'raw', raw: trimmed };
  }

  const { method, path } = parseRequestLine(match[3]);

  return {
    kind: 'access',
    raw: trimmed,
    ip: match[1],
    time: match[2],
    method,
    path,
    status: Number(match[4]),
    size: match[5],
    referrer: match[6] === '-' ? '' : match[6],
    userAgent: match[7],
  };
}

export function parseErrorLogLine(line: string): ParsedLogRow {
  const trimmed = line.trim();
  if (!trimmed) {
    return { kind: 'raw', raw: line };
  }

  const match = trimmed.match(NGINX_ERROR);
  if (!match) {
    return { kind: 'raw', raw: trimmed };
  }

  return {
    kind: 'error',
    raw: trimmed,
    time: match[1],
    level: match[2],
    message: match[3],
  };
}

export function splitLogContentNewestFirst(content: string | undefined | null): string[] {
  if (!content?.trim()) {
    return [];
  }
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .reverse();
}

export function parseLogLines(
  content: string | undefined | null,
  variant: 'access' | 'error'
): ParsedLogRow[] {
  const parseLine = variant === 'access' ? parseAccessLogLine : parseErrorLogLine;
  return splitLogContentNewestFirst(content).map(parseLine);
}

export function getHttpStatusClass(status: number): string {
  if (status >= 500) return 'text-red-700 font-semibold';
  if (status >= 400) return 'text-amber-700 font-semibold';
  if (status >= 300) return 'text-blue-700';
  if (status >= 200) return 'text-green-700';
  return 'text-gray-700';
}

export function getErrorLevelClass(level: string): string {
  const normalized = level.toLowerCase();
  if (normalized === 'error' || normalized === 'crit' || normalized === 'alert' || normalized === 'emerg') {
    return 'text-red-700 font-semibold uppercase';
  }
  if (normalized === 'warn' || normalized === 'warning') {
    return 'text-amber-700 font-semibold uppercase';
  }
  return 'text-gray-600 uppercase';
}
