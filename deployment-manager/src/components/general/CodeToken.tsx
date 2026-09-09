import { tv } from '~/lib/tv';
import NextLink from 'next/link';

const codeToken = tv({
  base: 'font-mono text-meta rounded-badge px-5 py-1',
  variants: {
    variant: {
      /** A value you'd type or copy - commit SHAs, env var names. */
      neutral: 'bg-hover border border-line-token text-ink',
      /** Linked to something real (e.g. a commit with a known repo URL). */
      linked: 'bg-primary-tint border border-primary-line transition-colors duration-100 hover:bg-primary-tint-hover hover:border-primary-line-strong',
      /** The value is absent. */
      absent: 'text-ink-ghost',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
});

interface CodeTokenProps {
  children: React.ReactNode;
  href?: string;
  className?: string;
}

/**
 * For values you'd type or copy, never for emphasis. Only a link when a
 * destination is actually known - otherwise it's a neutral token, never a
 * dead link.
 */
export default function CodeToken({ children, href, className }: CodeTokenProps) {
  if (!children) {
    return <span className={codeToken({ variant: 'absent', className })}>N/A</span>;
  }

  if (href) {
    return (
      <NextLink href={href} className={codeToken({ variant: 'linked', className })}>
        {children}
      </NextLink>
    );
  }

  return <span className={codeToken({ variant: 'neutral', className })}>{children}</span>;
}
