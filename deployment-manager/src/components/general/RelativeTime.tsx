'use client';

import { useEffect, useState } from 'react';

import { formatDateTimeStable } from '~/lib/formatDateTime';
import getRelativeTime from '~/utils/getRelativeTime';

interface RelativeTimeProps {
  value: string;
  showRelative?: boolean;
  className?: string;
  relativeClassName?: string;
  refreshInterval?: number;
}

/**
 * Absolute time is formatted identically on server and client.
 * Relative suffix is client-only (uses Date.now()) to avoid hydration mismatch.
 */
export default function RelativeTime({
  value,
  showRelative = false,
  className = 'font-mono text-meta text-ink-muted',
  relativeClassName = 'text-ink-ghost',
  refreshInterval = 30_000,
}: RelativeTimeProps) {
  const absolute = formatDateTimeStable(value);
  const [relative, setRelative] = useState('');

  useEffect(() => {
    if (!showRelative || !value) {
      setRelative('');
      return;
    }

    const updateRelativeTime = () => setRelative(getRelativeTime(value));

    updateRelativeTime();
    const intervalId = window.setInterval(updateRelativeTime, refreshInterval);

    return () => window.clearInterval(intervalId);
  }, [value, showRelative, refreshInterval]);

  if (!absolute) {
    return null;
  }

  return (
    <span className={className}>
      {absolute}
      {showRelative && relative ? (
        <span className={relativeClassName}> · {relative}</span>
      ) : null}
    </span>
  );
}
