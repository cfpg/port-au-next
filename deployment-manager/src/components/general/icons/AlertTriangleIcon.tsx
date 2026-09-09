import type { IconProps } from './types';

export default function AlertTriangleIcon({ size = 11, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9.5 17H2.5z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12" y2="17.2" />
    </svg>
  );
}
