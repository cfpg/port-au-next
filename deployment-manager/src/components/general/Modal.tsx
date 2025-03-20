import Link from 'next/link';
import { tv, type VariantProps } from 'tailwind-variants';

const modal = tv({
  slots: {
    backdrop: "fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4",
    container: "bg-white rounded-lg shadow-xl w-full overflow-y-auto max-h-[90vh]",
    header: "flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-100",
    title: "text-xl font-bold",
    closeButton: "text-gray-500 hover:text-gray-700 text-2xl",
    content: "p-6"
  },
  variants: {
    size: {
      sm: { container: "max-w-sm" },
      md: { container: "max-w-md" },
      lg: { container: "max-w-lg" },
      xl: { container: "max-w-xl" },
      "2xl": { container: "max-w-2xl" },
      "3xl": { container: "max-w-3xl" },
      "4xl": { container: "max-w-4xl" },
      "5xl": { container: "max-w-5xl" },
      "6xl": { container: "max-w-6xl" },
      "7xl": { container: "max-w-7xl" },
    }
  },
  defaultVariants: {
    size: "2xl"
  }
});

interface ModalProps extends VariantProps<typeof modal> {
  title: string;
  children: React.ReactNode;
  closeHref: string;
  className?: string;
}

export default function Modal({ title, children, closeHref, size, className }: ModalProps) {
  const { backdrop, container, header, title: titleStyles, closeButton, content } = modal({ size, className });

  return (
    <div className={backdrop()}>
      <div className={container()}>
        <div className={header()}>
          <h2 className={titleStyles()}>{title}</h2>
          <Link
            href={closeHref}
            className={closeButton()}
          >
            &times;
          </Link>
        </div>
        <div className={content()}>
          {children}
        </div>
      </div>
    </div>
  );
} 