/**
 * Single-quotes a value for safe interpolation into a POSIX shell command line. Unlike
 * double quotes, single quotes disable ALL expansion (`$(...)`, backticks, `$VAR`, `~`) -
 * the only character that needs special handling is an embedded single quote itself,
 * closed via the standard `'\''` sequence (end quote, escaped literal quote, reopen quote).
 */
function shellEscapeSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Format env vars for `docker run -e KEY=value`. Values are shell-escaped (see
 * shellEscapeSingleQuoted above) because callers (docker.ts, releasePipeline.ts,
 * prismaMigrate.ts) interpolate the resulting string directly into a shell command string
 * run via execCommand()'s `exec()` - double-quoting alone (the previous behavior here)
 * still allows `$(...)`/backtick command substitution inside the quotes, and at least one
 * of these values (BRANCH, for a webhook-triggered deployment) now originates from a
 * GitHub push payload rather than only an operator's own input. Keys are never escaped -
 * they're always fixed literals this codebase constructs itself, never derived from
 * webhook or other external input.
 */
export function formatDockerEnvString(appEnv: Record<string, string>): string {
  return Object.entries(appEnv)
    .map(([key, value]) => `-e${key}=${shellEscapeSingleQuoted(value)}`)
    .join(' ');
}
