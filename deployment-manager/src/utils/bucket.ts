/**
 * Generates a consistent bucket name for an app.
 * Production: `{appName}-bucket`. Preview (shared across preview branches): `{appName}-preview-bucket`.
 */
export function generateBucketName(appName: string, isPreview?: boolean): string {
  return `${appName}${isPreview ? `-preview` : ''}-bucket`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * MinIO IAM policy name for an app's production or shared-preview bucket.
 * Must differ from the production policy so preview users are not attached to the prod bucket.
 */
export function generateMinioPolicyName(appName: string, isPreview?: boolean): string {
  return `${appName.toLowerCase().replace(/[^a-z0-9]/g, '-')}${isPreview ? '-preview' : ''}-policy`;
} 