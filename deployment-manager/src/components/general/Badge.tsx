import { tv } from '~/lib/tv';
import { AlertTriangleIcon } from './icons';

const badge = tv({
  base: 'inline-flex items-center gap-6 font-mono text-mini rounded-badge px-8 py-3 border',
  variants: {
    tone: {
      success: 'bg-success-tint text-success-ink border-success-line',
      warning: 'bg-warning-tint text-warning-ink border-warning-line',
      danger: 'bg-danger-tint text-danger-ink border-danger-line',
      idle: 'bg-idle-tint text-idle-ink border-idle-line',
    },
  },
  defaultVariants: {
    tone: 'idle',
  },
});

const dot = tv({
  base: 'w-6 h-6 rounded-full shrink-0',
  variants: {
    tone: {
      success: 'bg-success',
      warning: 'bg-warning',
      danger: 'bg-danger',
      idle: 'bg-idle-dot',
    },
    pulse: {
      true: 'animate-dot',
    },
  },
  defaultVariants: {
    tone: 'idle',
  },
});

export type BadgeTone = 'success' | 'warning' | 'danger' | 'idle';

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  /** Shows the tone dot. Off by default for dense, dot-free rows. */
  withDot?: boolean;
  /** Swaps the dot for a warning triangle - for a state that needs attention rather than one in progress. */
  needsAttention?: boolean;
  className?: string;
}

/**
 * The single status-reporting component for the app: four tones only,
 * everything else in the product maps onto success/warning/danger/idle.
 * `warning` pulses automatically (build/pending) unless `needsAttention`
 * swaps the dot for a triangle (e.g. "missing route").
 */
export default function Badge({ children, tone = 'idle', withDot = true, needsAttention = false, className }: BadgeProps) {
  return (
    <span className={badge({ tone, className })}>
      {needsAttention ? (
        <AlertTriangleIcon size={11} className={tone === 'warning' ? 'text-warning-deep' : undefined} />
      ) : withDot ? (
        <span className={dot({ tone, pulse: tone === 'warning' })} />
      ) : null}
      <span>{children}</span>
    </span>
  );
}
