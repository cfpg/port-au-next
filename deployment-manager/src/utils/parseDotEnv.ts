export type ParseDotEnvResult = {
  vars: Record<string, string>;
  errors: string[];
};

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseDotEnv(content: string): ParseDotEnvResult {
  const vars: Record<string, string> = {};
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    let line = lines[i].trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('export ')) {
      line = line.slice(7).trim();
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      errors.push(`Line ${lineNumber}: expected KEY=value`);
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!KEY_PATTERN.test(key)) {
      errors.push(`Line ${lineNumber}: invalid key "${key}"`);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      errors.push(`Line ${lineNumber}: duplicate key "${key}"`);
      continue;
    }

    vars[key] = value;
  }

  return { vars, errors };
}
