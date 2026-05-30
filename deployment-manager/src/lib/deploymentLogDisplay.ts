const BUILD_LOG_TEXT_KEYS = ['logContent', 'tailRedacted', 'buildLogTail'] as const;

/** Metadata keys rendered as preformatted text (not inside JSON.stringify). */
const METADATA_MULTILINE_KEYS = [
  'output',
  'stdout',
  'stderr',
  'stack',
  'message',
  'tail',
  'command',
  'logContent',
  'tailRedacted',
  'buildLogTail',
] as const;

export interface MetadataTextBlock {
  label: string;
  text: string;
}

/** Turn literal "\\n" sequences into real newlines (e.g. double-encoded DB values). */
export function unescapeDisplayNewlines(text: string): string {
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

export type DeploymentLogLevel = 'info' | 'error' | 'warning' | 'debug';

export function normalizeDeploymentLogType(type: string | undefined | null): DeploymentLogLevel {
  const normalized = String(type ?? 'info')
    .trim()
    .toLowerCase();

  if (
    normalized === 'error' ||
    normalized === 'warning' ||
    normalized === 'debug' ||
    normalized === 'info'
  ) {
    return normalized;
  }

  return 'info';
}

export function normalizeDeploymentLogMetadata(
  metadata: unknown
): Record<string, unknown> | undefined {
  if (metadata === null || metadata === undefined) {
    return undefined;
  }

  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  return undefined;
}

export function extractBuildLogText(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) {
    return null;
  }

  for (const key of BUILD_LOG_TEXT_KEYS) {
    const value = metadata[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

export function metadataWithoutBuildLogText(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const rest = { ...metadata };
  for (const key of BUILD_LOG_TEXT_KEYS) {
    delete rest[key];
  }

  return Object.keys(rest).length > 0 ? rest : undefined;
}

function pushTextBlock(
  blocks: MetadataTextBlock[],
  label: string,
  value: unknown
): void {
  if (typeof value !== 'string' || value.length === 0) {
    return;
  }

  blocks.push({
    label,
    text: unescapeDisplayNewlines(value),
  });
}

export function extractMetadataTextBlocks(
  metadata: Record<string, unknown> | undefined
): MetadataTextBlock[] {
  if (!metadata) {
    return [];
  }

  const blocks: MetadataTextBlock[] = [];

  for (const key of METADATA_MULTILINE_KEYS) {
    pushTextBlock(blocks, key, metadata[key]);
  }

  const error = metadata.error;
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const err = error as Record<string, unknown>;
    pushTextBlock(blocks, 'error.message', err.message);
    pushTextBlock(blocks, 'error.stack', err.stack);
  }

  return blocks;
}

export function metadataForCompactJson(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const rest = { ...metadata };
  const stripKeys = new Set<string>([
    ...BUILD_LOG_TEXT_KEYS,
    ...METADATA_MULTILINE_KEYS,
    'error',
  ]);

  for (const key of stripKeys) {
    delete rest[key];
  }

  return Object.keys(rest).length > 0 ? rest : undefined;
}

export function getLogTypeClass(type: string): string {
  switch (normalizeDeploymentLogType(type)) {
    case 'error':
      return 'bg-red-50 border-l-4 border-red-500';
    case 'warning':
      return 'bg-yellow-50 border-l-4 border-yellow-500';
    case 'debug':
      return 'bg-gray-50 border-l-4 border-gray-500';
    default:
      return 'bg-blue-50 border-l-4 border-blue-500';
  }
}

export type BuildLogLineLevel = DeploymentLogLevel;

/** Classify a single docker / npm build output line for row styling. */
export function classifyBuildLogLine(line: string): BuildLogLineLevel {
  const trimmed = line.trim();
  if (!trimmed) {
    return 'info';
  }

  const upper = trimmed.toUpperCase();

  if (
    /#\d+\s+ERROR\b/.test(upper) ||
    /\bERROR\b/.test(upper) ||
    /\bFAILED\b/.test(upper) ||
    /\bFATAL\b/.test(upper) ||
    /\bERR!/.test(upper)
  ) {
    return 'error';
  }

  if (
    /#\d+\s+WARNING\b/.test(upper) ||
    /\bWARN(?:ING)?\b/.test(upper) ||
    /\bDEPRECATED\b/.test(upper)
  ) {
    return 'warning';
  }

  if (/\bDEBUG\b/.test(upper) || /\[debug\]/i.test(trimmed)) {
    return 'debug';
  }

  return 'info';
}

export function getBuildLineClass(level: BuildLogLineLevel): string {
  switch (level) {
    case 'error':
      return 'bg-red-50 text-red-900';
    case 'warning':
      return 'bg-yellow-50 text-yellow-900';
    case 'debug':
      return 'bg-gray-50 text-gray-700';
    default:
      return 'text-gray-800';
  }
}
