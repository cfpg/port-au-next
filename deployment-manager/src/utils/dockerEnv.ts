/** Format env vars for `docker run -e KEY=value` (values are not shell-escaped). */
export function formatDockerEnvString(appEnv: Record<string, string>): string {
  return Object.entries(appEnv)
    .map(([key, value]) => `"-e${key}=${value}"`)
    .join(' ');
}
