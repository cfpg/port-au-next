'use client';

import { tv, VariantProps } from 'tailwind-variants';
import Button from './Button';

const modal = tv({
  slots: {
    backdrop: "fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4",
    container: "bg-white rounded-lg shadow-xl w-full flex flex-col",
    header: "flex justify-between items-center px-6 py-4 rounded-t-lg border-b border-gray-200 bg-gray-100",
    title: "text-xl font-bold text-black",
    closeButton: "text-gray-500 hover:text-gray-700 text-2xl",
    content: "p-6 overflow-y-auto flex-1"
  },
  variants: {
    size: {
      sm: { container: "max-w-sm max-h-[90vh]" },
      md: { container: "max-w-md max-h-[90vh]" },
      lg: { container: "max-w-lg max-h-[90vh]" },
      xl: { container: "max-w-xl max-h-[90vh]" },
      "2xl": { container: "max-w-2xl max-h-[90vh]" },
      "3xl": { container: "max-w-3xl max-h-[90vh]" },
      "4xl": { container: "max-w-4xl max-h-[90vh]" },
      "5xl": { container: "max-w-5xl max-h-[90vh]" },
      "6xl": { container: "max-w-6xl max-h-[90vh]" },
      "7xl": { container: "max-w-7xl max-h-[90vh]" },
    }
  },
  defaultVariants: {
    size: "2xl"
  }
});

interface ModalProps extends VariantProps<typeof modal> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
};

export default function Modal({ isOpen, onClose, title, children, size, className }: ModalProps) {
  if (!isOpen) return null;

  const { backdrop, container, header, title: titleStyles, closeButton, content } = modal({ size, className });

  return (
    <div className={backdrop()}>
      <div className={container()}>
        <div className={header()}>
          <h2 className={titleStyles()}>{title}</h2>
          <Button
            onClick={onClose}
            className={closeButton()}
            color="transparent"
            size="sm"
          >
            &times;
          </Button>
        </div>
        <div className={content()}>
          {children}
        </div>
      </div>
    </div>
  );
} 