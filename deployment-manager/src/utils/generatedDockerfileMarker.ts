export const GENERATED_DOCKERFILE_MARKER_PREFIX = '# generated-by-port-au-next';
export const GENERATED_DOCKERFILE_VERSION = 5;
export const FLAG_USES_PRISMA = 'uses_prisma';

export type ParsedGeneratedDockerfileMarker = {
  version: number | null;
  flags: Set<string>;
  raw: string;
  isLegacyAlias: boolean;
  legacyAlias?: 'prisma' | 'next';
};

export function buildGeneratedDockerfileMarker(options: {
  version: number;
  flags: string[];
}): string {
  const versionPart = `v${options.version}`;
  const flagTokens = options.flags.map((flag) => `-${flag}`).join(' ');
  if (flagTokens) {
    return `${GENERATED_DOCKERFILE_MARKER_PREFIX} ${versionPart} ${flagTokens}`;
  }
  return `${GENERATED_DOCKERFILE_MARKER_PREFIX} ${versionPart}`;
}

export function parseGeneratedDockerfileMarker(
  content: string
): ParsedGeneratedDockerfileMarker | null {
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().includes('generated-by-port-au-next')) {
      continue;
    }

    const markerMatch = trimmed.match(/^\#\s*generated-by-port-au-next\b(.*)$/i);
    if (!markerMatch) {
      continue;
    }

    const rest = markerMatch[1].trim();
    const legacyMatch = rest.match(/^:\s*(prisma|next)\s*$/i);
    if (legacyMatch) {
      const alias = legacyMatch[1].toLowerCase() as 'prisma' | 'next';
      return {
        version: null,
        flags: alias === 'prisma' ? new Set([FLAG_USES_PRISMA]) : new Set(),
        raw: trimmed,
        isLegacyAlias: true,
        legacyAlias: alias,
      };
    }

    const tokens = rest.split(/\s+/).filter(Boolean);
    let version: number | null = null;
    const flags = new Set<string>();

    for (const token of tokens) {
      if (/^v\d+$/i.test(token)) {
        version = parseInt(token.slice(1), 10);
      } else if (token.startsWith('-')) {
        flags.add(token.slice(1));
      }
    }

    return {
      version,
      flags,
      raw: trimmed,
      isLegacyAlias: false,
    };
  }

  return null;
}

export function getDesiredFlags(usesPrisma: boolean): string[] {
  return usesPrisma ? [FLAG_USES_PRISMA] : [];
}

export function buildDesiredGeneratedDockerfileMarker(usesPrisma: boolean): string {
  return buildGeneratedDockerfileMarker({
    version: GENERATED_DOCKERFILE_VERSION,
    flags: getDesiredFlags(usesPrisma),
  });
}

export function shouldRegenerateGeneratedDockerfile(
  parsed: ParsedGeneratedDockerfileMarker,
  usesPrisma: boolean
): boolean {
  if (parsed.isLegacyAlias) {
    return true;
  }

  if (parsed.version === null || parsed.version < GENERATED_DOCKERFILE_VERSION) {
    return true;
  }

  const hasUsesPrisma = parsed.flags.has(FLAG_USES_PRISMA);
  return hasUsesPrisma !== usesPrisma;
}
