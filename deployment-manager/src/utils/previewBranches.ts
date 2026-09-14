import { createHash } from 'crypto';

/**
 * Sanitizes a branch name to be used in a subdomain.
 * Replaces any non-alphanumeric characters with hyphens and ensures it's lowercase.
 *
 * A bare sanitized name collides for branches that only differ in a character this
 * strips (e.g. "feature/foo" and "feature-foo" both become "feature-foo"), so callers
 * that need a unique identifier should use `slugifyBranchForResourceName` instead.
 */
export function sanitizeBranchForSubdomain(branch: string): string {
  return branch
    .toLowerCase()
    // Replace any character that's not a letter, number, or hyphen with a hyphen
    .replace(/[^a-z0-9-]/g, '-')
    // Replace multiple consecutive hyphens with a single hyphen
    .replace(/-+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '');
}

// Bounds the sanitized portion so the hash suffix below is never at risk of being cut off
// by a length limit further down the line (a DNS label is 63 chars; combined with an
// app name and Postgres's 63-byte NAMEDATALEN for `<appName>_<slug>_user`/`_db`, an
// unbounded slug could push the suffix past a truncation point and defeat the entire
// point of adding it - two colliding branches could truncate to the identical string.
const MAX_SANITIZED_SEGMENT_LENGTH = 40;

/**
 * Sanitized branch name (length-bounded) plus a short stable hash of the full original
 * branch name, so branches that collide under sanitization alone (e.g. "feature/foo" vs
 * "feature-foo") - or that only differ past the truncation point - still produce distinct
 * subdomains/database name prefixes.
 */
export function slugifyBranchForResourceName(branch: string): string {
  const sanitized = sanitizeBranchForSubdomain(branch)
    .slice(0, MAX_SANITIZED_SEGMENT_LENGTH)
    .replace(/-+$/g, '');
  const suffix = createHash('sha1').update(branch).digest('hex').slice(0, 6);
  return sanitized ? `${sanitized}-${suffix}` : suffix;
}

/**
 * Generates the full subdomain for a preview branch.
 * @param branch The git branch name
 * @param previewDomain The base preview domain (e.g., preview.example.com)
 * @returns The full subdomain (e.g., feature-123.preview.example.com)
 */
export function getPreviewBranchSubdomain(branch: string, previewDomain: string): string {
  const slug = slugifyBranchForResourceName(branch);
  return `${slug}.${previewDomain}`;
}