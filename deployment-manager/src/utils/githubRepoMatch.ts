/**
 * Normalizes a github.com repo URL (SSH or HTTPS, with or without a .git suffix) to a
 * lowercase "owner/repo" string, or null if it isn't a github.com URL at all. Used only
 * for matching an app's stored repo_url against GitHub API results (installation
 * repositories) - not for display, where the existing getGithubRepoPath util is used.
 */
export function normalizeGithubRepoFullName(url: string): string | null {
  const trimmed = url.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase();
  }
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`.toLowerCase();
  }
  return null;
}

/** Credential-free HTTPS clone URL for a github.com repo, safe to store as `origin` permanently. */
export function buildCredentialFreeCloneUrl(repoFullName: string): string {
  return `https://x-access-token@github.com/${repoFullName}.git`;
}
