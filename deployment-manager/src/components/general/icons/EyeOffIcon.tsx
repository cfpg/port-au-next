import type { IconProps } from './types';

export default function EyeOffIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.06 4.14M6.6 6.6C3.9 8.3 2 11 2 11s3.6 7 10 7a9.3 9.3 0 0 0 4.4-1.1" />
      <path d="M9.5 9.5a2.6 2.6 0 0 0 3.6 3.6" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}
