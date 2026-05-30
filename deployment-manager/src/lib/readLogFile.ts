import fs from 'fs';

import { redactLogText } from '~/lib/redactLogs';
import { LOG_TAIL_DEFAULT_BYTES, LOG_TAIL_MAX_BYTES } from '~/lib/logPaths';

export class LogFileNotFoundError extends Error {
  constructor(message = 'Log file not found') {
    super(message);
    this.name = 'LogFileNotFoundError';
  }
}

export function clampLogReadBytes(requestedBytes?: number): number {
  const bytes = requestedBytes ?? LOG_TAIL_DEFAULT_BYTES;
  return Math.min(Math.max(1, bytes), LOG_TAIL_MAX_BYTES);
}

export function readLogTail(
  filePath: string,
  requestedBytes?: number,
  redact = true
): { content: string; sizeBytes: number; truncated: boolean } {
  if (!fs.existsSync(filePath)) {
    throw new LogFileNotFoundError();
  }

  const bytes = clampLogReadBytes(requestedBytes);
  const stat = fs.statSync(filePath);
  const sizeBytes = stat.size;

  if (sizeBytes === 0) {
    return { content: '', sizeBytes: 0, truncated: false };
  }

  const readLength = Math.min(bytes, sizeBytes);
  const start = sizeBytes - readLength;
  const fd = fs.openSync(filePath, 'r');

  try {
    const buffer = Buffer.alloc(readLength);
    fs.readSync(fd, buffer, 0, readLength, start);
    let content = buffer.toString('utf8');
    if (redact) {
      content = redactLogText(content);
    }
    return {
      content,
      sizeBytes,
      truncated: sizeBytes > readLength,
    };
  } finally {
    fs.closeSync(fd);
  }
}
