import { tv } from '~/lib/tv';

const avatar = tv({
  base: 'inline-flex items-center justify-center shrink-0 rounded-control font-display font-semibold',
  variants: {
    tone: {
      /** People. The only teal-tinted avatar. */
      user: 'bg-primary-tint border border-primary-line text-primary-active',
      /** Services, containers, anything that isn't a person - one neutral tone, never a rainbow. */
      neutral: 'bg-hover border border-line-strong text-ink-soft',
    },
    size: {
      sm: 'size-20 text-micro',
      md: 'size-26 text-field',
      lg: 'size-28 text-field',
    },
  },
  defaultVariants: {
    tone: 'user',
    size: 'lg',
  },
});

interface AvatarProps {
  name: string;
  tone?: 'user' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Avatar({ name, tone, size, className }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase();

  return (
    <span className={avatar({ tone, size, className })}>
      {initial}
    </span>
  );
}
