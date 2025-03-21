import { tv, VariantProps } from 'tailwind-variants';

const badge = tv({
  base: 'inline-flex items-center rounded-full text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  variants: {
    color: {
      green: 'bg-green-100 text-green-800',
      red: 'bg-red-100 text-red-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      gray: 'bg-gray-100 text-gray-800',
      blue: 'bg-blue-100 text-blue-800',
    },
    size: {
      xs: 'text-xs px-2 py-1',
      sm: 'text-sm px-4 py-2',
      md: 'text-lg px-5 py-2.5',
    },
  },
  defaultVariants: {
    color: "gray",
    size: 'sm',
  },
});

interface BadgeProps extends VariantProps<typeof badge> {
  className?: string;
  children: React.ReactNode;
}

export default function Badge({ className, children, size, color, ...props }: BadgeProps) {
  return <span className={badge({ className, size, color })} {...props}>{children}</span>;
} 