const REDACTED = '[REDACTED]';

let activeSecrets: string[] = [];

export function setActiveRedactionSecrets(secrets: string[]): void {
  activeSecrets = [...new Set(secrets.filter((value) => value.length > 0))].sort(
    (a, b) => b.length - a.length
  );
}

export function clearActiveRedactionSecrets(): void {
  activeSecrets = [];
}

export function getActiveRedactionSecrets(): string[] {
  return activeSecrets;
}

export function collectSecretValues(env: Record<string, string>): string[] {
  return [...new Set(Object.values(env).filter((value) => value.length > 0))].sort(
    (a, b) => b.length - a.length
  );
}

export function redactLogText(text: string, secrets: string[] = activeSecrets): string {
  if (!text) {
    return text;
  }

  let result = text;

  for (const secret of secrets) {
    if (secret.length >= 4) {
      result = result.split(secret).join(REDACTED);
    }
  }

  result = result.replace(/postgresql:\/\/[^\s'"\\]+/gi, `postgresql://${REDACTED}`);
  result = result.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, `Bearer ${REDACTED}`);

  return result;
}

export function redactMetadata(
  metadata: Record<string, unknown>,
  secrets: string[] = activeSecrets
): Record<string, unknown> {
  if (!metadata || Object.keys(metadata).length === 0) {
    return metadata;
  }

  try {
    return JSON.parse(redactLogText(JSON.stringify(metadata), secrets)) as Record<string, unknown>;
  } catch {
    return metadata;
  }
}
