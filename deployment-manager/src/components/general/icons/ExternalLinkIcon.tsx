import type { IconProps } from './types';

export default function ExternalLinkIcon({ size = 11, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5h6v6" />
      <path d="M19 5L9 15" />
      <path d="M17 14v5H5V7h5" />
    </svg>
  );
}
