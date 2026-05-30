import type { FileLogResponse } from '~/components/deployments/deploymentLogTypes';

export async function fileLogFetcher(url: string): Promise<FileLogResponse> {
  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : 'Failed to load log file';
    throw new Error(message);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('content' in body) ||
    typeof (body as FileLogResponse).content !== 'string'
  ) {
    throw new Error('Invalid log file response');
  }

  return body as FileLogResponse;
}
