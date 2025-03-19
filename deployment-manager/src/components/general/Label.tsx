import { tv } from 'tailwind-variants';

const label = tv({
  base: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  variants: {},
  defaultVariants: {},
});

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

export default function Label({ className, ...props }: LabelProps) {
  return <label className={label({ className })} {...props} />;
} 