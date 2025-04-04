/**
 * Sanitizes a branch name to be used in a subdomain.
 * Replaces any non-alphanumeric characters with hyphens and ensures it's lowercase.
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

/**
 * Generates the full subdomain for a preview branch.
 * @param branch The git branch name
 * @param previewDomain The base preview domain (e.g., preview.example.com)
 * @returns The full subdomain (e.g., feature-123.preview.example.com)
 */
export function getPreviewBranchSubdomain(branch: string, previewDomain: string): string {
  const sanitizedBranch = sanitizeBranchForSubdomain(branch);
  return `${sanitizedBranch}.${previewDomain}`;
} 