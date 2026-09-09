import { tv } from 'tailwind-variants';
import { InfoIcon, AlertTriangleIcon, AlertCircleIcon } from './icons';

const callout = tv({
  slots: {
    base: 'rounded-control border border-l-3 px-12 py-10',
    iconWrap: 'shrink-0 mt-1',
    title: 'font-display font-semibold text-field mb-3',
    body: 'text-field leading-[1.55]',
  },
  variants: {
    tone: {
      info: {
        base: 'bg-primary-tint border-primary-line border-l-primary',
        iconWrap: 'text-primary',
        title: 'text-primary-active',
        body: 'text-primary-active',
      },
      warning: {
        base: 'bg-warning-tint border-warning-line border-l-warning',
        iconWrap: 'text-warning-deep',
        title: 'text-warning-ink',
        body: 'text-warning-ink',
      },
      danger: {
        base: 'bg-danger-tint border-danger-line border-l-danger',
        iconWrap: 'text-danger-solid',
        title: 'text-danger-ink',
        body: 'text-danger-ink',
      },
    },
  },
  defaultVariants: {
    tone: 'info',
  },
});

const icons = {
  info: InfoIcon,
  warning: AlertTriangleIcon,
  danger: AlertCircleIcon,
};

interface CalloutProps {
  tone?: 'info' | 'warning' | 'danger';
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * States a consequence, never decorates. Three tones only. At most one
 * callout per panel — two stacked ones means neither gets read.
 */
export default function Callout({ tone = 'info', title, children, className }: CalloutProps) {
  const styles = callout({ tone });
  const Icon = icons[tone];

  return (
    <div className={styles.base({ className })}>
      <div className="flex items-start gap-9">
        <span className={styles.iconWrap()}>
          <Icon size={14} />
        </span>
        <div>
          {title ? <div className={styles.title()}>{title}</div> : null}
          <div className={styles.body()}>{children}</div>
        </div>
      </div>
    </div>
  );
}
