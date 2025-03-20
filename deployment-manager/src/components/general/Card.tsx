import { tv } from 'tailwind-variants';

const card = tv({
  slots: {
    base: 'rounded-lg border border-gray-400 bg-card text-card-foreground shadow-sm',
    header: 'flex flex-col space-y-1 p-2 bg-gray-100 rounded-t-lg border-b border-gray-400',
    title: 'text-sm font-bold leading-none tracking-relaxed text-gray-700 py-1 px-2',
    content: ''
  },
  variants: {
    padding: {
      table: { content: 'p-0' },
      content: { content: 'p-6' }
    }
  },
  defaultVariants: {
    padding: 'content'
  }
});

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function Card({ className, ...props }: CardProps) {
  const { base } = card();
  return <div className={base({ className })} {...props} />;
}

export function CardHeader({ className, ...props }: CardProps) {
  const { header } = card();
  return <div className={header({ className })} {...props} />;
}

export function CardTitle({ className, ...props }: CardProps) {
  const { title } = card();
  return <h3 className={title({ className })} {...props} />;
}

export function CardContent({ className, padding, ...props }: CardProps & { padding?: 'table' | 'content' }) {
  const { content } = card({ padding });
  return <div className={content({ className })} {...props} />;
} 