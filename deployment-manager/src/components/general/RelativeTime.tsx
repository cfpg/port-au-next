'use client';

import { useEffect, useState } from 'react';

import { formatDateTimeStable } from '~/lib/formatDateTime';
import getRelativeTime from '~/utils/getRelativeTime';

interface RelativeTimeProps {
  value: string;
  showRelative?: boolean;
  className?: string;
  relativeClassName?: string;
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
}: RelativeTimeProps) {
  const absolute = formatDateTimeStable(value);
  const [relative, setRelative] = useState('');

  useEffect(() => {
    if (showRelative && value) {
      setRelative(getRelativeTime(value));
    }
  }, [value, showRelative]);

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
