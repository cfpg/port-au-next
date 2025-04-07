/**
 * Generates a consistent bucket name for an app
 * @param appName The name of the app
 * @returns A sanitized bucket name in the format: {appName}-bucket
 */
export function generateBucketName(appName: string, isPreview?: boolean): string {
  return `${appName}${isPreview ? `-preview` : ''}-bucket`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
} 