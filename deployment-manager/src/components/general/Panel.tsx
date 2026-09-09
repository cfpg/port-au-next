import { tv } from '~/lib/tv';
import type { VariantProps } from 'tailwind-variants';

const panel = tv({
  slots: {
    base: 'bg-surface border border-line rounded-panel shadow-panel overflow-hidden',
    header: 'flex items-center justify-between gap-10 px-13 py-9 bg-paper border-b border-line',
    title: 'font-display font-semibold text-panel',
    body: 'text-panel leading-[1.55] text-ink-muted',
    footer: 'flex justify-end gap-7 px-13 py-10 bg-paper border-t border-line',
  },
  variants: {
    /** flush removes body padding so table rows reach the panel edge. */
    flush: {
      false: { body: 'p-14' },
      true: {},
    },
  },
  defaultVariants: {
    flush: false,
  },
});

interface PanelProps extends VariantProps<typeof panel> {
  /** Simple text/node title - rendered in the panel's standard header style. */
  title?: React.ReactNode;
  /** Full custom header content (e.g. title + status badge + actions). Takes precedence over `title`. */
  header?: React.ReactNode;
  content?: React.ReactNode;
  /** Right-aligned footer - use when the panel holds unsaved work with a commit action. */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * The container everything else lives in. Every panel has a header bar - a
 * white box floating with no title is never a panel. Never nest a panel in
 * a panel; use a hairline-bordered group or Disclosure instead.
 */
export default function Panel({
  header,
  title,
  content,
  footer,
  flush,
  className,
}: PanelProps) {
  const styles = panel({ flush });

  return (
    <div className={styles.base({ className })}>
      {(header || title) && (
        <div className={styles.header()}>
          {header ?? <span className={styles.title()}>{title}</span>}
        </div>
      )}
      {content && <div className={styles.body()}>{content}</div>}
      {footer && <div className={styles.footer()}>{footer}</div>}
    </div>
  );
}
