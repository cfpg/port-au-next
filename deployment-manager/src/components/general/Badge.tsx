import { tv } from 'tailwind-variants';

const badge = tv({
  base: 'inline-flex items-center rounded-full text-sm font-medium px-2 py-1',
  variants: {
    color: {
      gray: 'bg-gray-100 text-gray-800',
      red: 'bg-red-100 text-red-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      green: 'bg-green-100 text-green-800',
      blue: 'bg-blue-100 text-blue-800',
      indigo: 'bg-indigo-100 text-indigo-800',
      purple: 'bg-purple-100 text-purple-800',
      pink: 'bg-pink-100 text-pink-800'
    },
    withDot: {
      true: 'space-x-1.5'
    }
  },
  defaultVariants: {
    color: 'gray'
  }
});

const dot = tv({
  base: 'h-1.5 w-1.5 rounded-full',
  variants: {
    color: {
      gray: 'bg-gray-800',
      red: 'bg-red-800',
      yellow: 'bg-yellow-800',
      green: 'bg-green-800',
      blue: 'bg-blue-800',
      indigo: 'bg-indigo-800',
      purple: 'bg-purple-800',
      pink: 'bg-pink-800'
    }
  },
  defaultVariants: {
    color: 'gray'
  }
});

interface BadgeProps {
  children: React.ReactNode;
  color?: 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink';
  withDot?: boolean;
}

export default function Badge({ children, color = 'gray', withDot = false }: BadgeProps) {
  return (
    <span className={badge({ color, withDot })}>
      {withDot && <span className={dot({ color })} />}
      <span>{children}</span>
    </span>
  );
} 