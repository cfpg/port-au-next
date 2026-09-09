interface LogoProps {
  size?: number;
  className?: string;
}

/** The Port-Au-Next sun/wave mark, alone. Pair with the wordmark via Brand. */
export default function Logo({ size = 20, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id="pan-logo-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0A53C" />
          <stop offset="1" stopColor="#E2553B" />
        </linearGradient>
      </defs>
      <path d="M10 31 A14 14 0 0 1 38 31 Z" fill="url(#pan-logo-sun)" />
      <line x1="14" y1="23.5" x2="34" y2="23.5" stroke="#fff" strokeWidth="2" />
      <line x1="11.5" y1="28" x2="36.5" y2="28" stroke="#fff" strokeWidth="2" />
      <line x1="8" y1="35" x2="40" y2="35" stroke="#3E7C8C" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
