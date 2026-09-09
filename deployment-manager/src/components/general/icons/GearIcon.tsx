import type { IconProps } from './types';

export default function GearIcon({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2.8" />
      <path d="M19.2 14.4a7.6 7.6 0 0 0 0-4.8l2-1.4-2-3.4-2.3 1a7.6 7.6 0 0 0-2.1-1.2L14.4 2H9.6l-.4 2.6a7.6 7.6 0 0 0-2.1 1.2l-2.3-1-2 3.4 2 1.4a7.6 7.6 0 0 0 0 4.8l-2 1.4 2 3.4 2.3-1a7.6 7.6 0 0 0 2.1 1.2L9.6 22h4.8l.4-2.6a7.6 7.6 0 0 0 2.1-1.2l2.3 1 2-3.4z" />
    </svg>
  );
}
