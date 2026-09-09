interface SkeletonProps {
  className?: string;
}

/** Structural loading - for tables and panels whose shape is already known. */
export default function Skeleton({ className = 'h-9 w-full' }: SkeletonProps) {
  return (
    <span
      className={`block rounded-badge bg-[linear-gradient(90deg,#F1ECE4_0%,#F7F1E8_40%,#F1ECE4_80%)] bg-[length:220px_100%] animate-shimmer ${className}`}
    />
  );
}
