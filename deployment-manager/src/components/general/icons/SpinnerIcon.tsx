interface SpinnerIconProps {
  size?: number;
  className?: string;
  /** Thickness of the ring border, in px. */
  thickness?: number;
}

/**
 * The kit's inline loading ring — a bordered circle with one accented
 * quadrant, spun via the `animate-spin-fast` utility. Not an SVG: matching
 * the kit's own markup keeps the border-driven look exact.
 */
export default function SpinnerIcon({ size = 13, className = '', thickness = 1.6 }: SpinnerIconProps) {
  return (
    <span
      className={`inline-block rounded-full animate-spin-fast ${className}`}
      style={{ width: size, height: size, borderWidth: thickness, borderStyle: 'solid' }}
    />
  );
}
