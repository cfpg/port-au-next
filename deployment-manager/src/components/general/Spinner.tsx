import SpinnerIcon from './icons/SpinnerIcon';

interface SpinnerProps {
  size?: number;
  className?: string;
}

/** Inline only - never centre a spinner in a panel that has a known shape; use Skeleton instead. */
export default function Spinner({ size = 14, className = 'border-line border-t-primary' }: SpinnerProps) {
  return <SpinnerIcon size={size} thickness={2} className={className} />;
}
