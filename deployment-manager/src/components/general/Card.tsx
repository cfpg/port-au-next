import { tv } from 'tailwind-variants';

const card = tv({
  base: 'rounded-lg border bg-card text-card-foreground shadow-sm',
  variants: {},
  defaultVariants: {},
});

const cardHeader = tv({
  base: 'flex flex-col space-y-1.5 p-6',
  variants: {},
  defaultVariants: {},
});

const cardTitle = tv({
  base: 'text-2xl font-semibold leading-none tracking-tight',
  variants: {},
  defaultVariants: {},
});

const cardContent = tv({
  base: 'p-6 pt-0',
  variants: {},
  defaultVariants: {},
});

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function Card({ className, ...props }: CardProps) {
  return <div className={card({ className })} {...props} />;
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cardHeader({ className })} {...props} />;
}

export function CardTitle({ className, ...props }: CardProps) {
  return <h3 className={cardTitle({ className })} {...props} />;
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cardContent({ className })} {...props} />;
} 