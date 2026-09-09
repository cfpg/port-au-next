import { ComponentProps } from 'react';
import { default as NextLink } from 'next/link';
import { tv } from '~/lib/tv';
import type { VariantProps } from 'tailwind-variants';
import { buttonStyles } from './Button';
import { ExternalLinkIcon } from './icons';

const linkStyles = tv({
  base: 'transition-colors duration-150',
  variants: {
    variant: {
      /** In-app navigation to a resource — mono, no underline. */
      default: 'font-mono text-field',
      /** Leaves the app / points at a hostname the user owns — underlined. */
      hostname: 'font-mono text-field underline decoration-primary-line underline-offset-2',
      /** Quiet, for footers and secondary chrome. */
      quiet: 'text-ink-faint hover:text-ink-muted',
      /** Sidebar section item. */
      nav: 'flex items-center gap-9 rounded-control px-9 py-7 text-panel font-medium text-ink-muted hover:bg-hover',
      /** Sidebar app entry — a hostname, so mono. */
      subNav: 'block rounded-control px-8 py-5 font-mono text-meta text-ink-muted truncate hover:bg-hover',
    },
    isActive: {
      true: '',
    },
  },
  compoundVariants: [
    { variant: 'nav', isActive: true, class: 'bg-primary-tint text-ink' },
    { variant: 'subNav', isActive: true, class: 'bg-primary-tint text-primary-active' },
  ],
  defaultVariants: {
    variant: 'default',
    isActive: false,
  },
});

type LinkVariant = NonNullable<VariantProps<typeof linkStyles>['variant']>;
type ButtonTone = NonNullable<VariantProps<typeof buttonStyles>['variant']>;
type ButtonSize = NonNullable<VariantProps<typeof buttonStyles>['size']>;

type LinkProps = Omit<ComponentProps<typeof NextLink>, 'className'> & {
  variant?: LinkVariant | 'button';
  isActive?: boolean;
  className?: string;
  /** Only applies when variant="button" — matches Button's variant prop. */
  tone?: ButtonTone;
  /** Only applies when variant="button". */
  size?: ButtonSize;
  /** Appends the "leaves the app" arrow and opens in a new tab. */
  external?: boolean;
};

export default function Link({
  variant = 'default',
  isActive,
  tone,
  size,
  external,
  className,
  children,
  ...props
}: LinkProps) {
  if (variant === 'button') {
    return (
      <NextLink
        {...props}
        target={external ? '_blank' : props.target}
        rel={external ? 'noopener noreferrer' : props.rel}
        className={buttonStyles({ variant: tone, size }).base({ className })}
      >
        {children}
      </NextLink>
    );
  }

  return (
    <NextLink
      {...props}
      target={external ? '_blank' : props.target}
      rel={external ? 'noopener noreferrer' : props.rel}
      className={linkStyles({ variant, isActive, className })}
    >
      {external ? (
        <span className="inline-flex items-center gap-5">
          {children}
          <ExternalLinkIcon />
        </span>
      ) : (
        children
      )}
    </NextLink>
  );
}
