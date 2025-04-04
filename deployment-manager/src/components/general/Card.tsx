import { tv, type VariantProps } from 'tailwind-variants';

const card = tv({
  slots: {
    base: 'rounded-lg border border-gray-400 bg-card text-card-foreground shadow-sm bg-white',
    header: 'flex flex-row items-center justify-between space-2 px-4 py-2 bg-gray-100 rounded-t-lg border-b border-gray-400',
    title: 'text-sm font-bold leading-none tracking-relaxed text-gray-700 py-1',
    content: ''
  },
  variants: {
    padding: {
      table: { content: 'p-0', base: 'overflow-hidden' },
      content: { content: 'p-6' }
    }
  },
  defaultVariants: {
    padding: 'content'
  }
});

interface CardProps extends VariantProps<typeof card> {
  header?: React.ReactNode;
  title?: React.ReactNode;
  content?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  isLoading?: boolean;
}

export default function Card({ 
  header,
  title,
  content,
  className,
  padding,
  actions,
  isLoading = false,
  ...props 
}: CardProps) {
  const styles = card({ padding });

  return (
    <div className={styles.base({ className })} {...props}>
      {(header || title) && (
        <div className={styles.header()}>
          {title && <h3 className={styles.title()}>{title}</h3>}
          {header}
        </div>
      )}
      {content && (
        <div className={styles.content()}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-4 h-4 animate-spin rounded-full border-t-2 border-b-2 border-gray-900" />
            </div>
          ) : (
            content
          )}
        </div>
      )}
      {actions && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          {actions}
        </div>
      )}
    </div>
  );
} 