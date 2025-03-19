import {ComponentProps} from 'react';
import {default as NextLink} from 'next/link';
import { tv, type VariantProps } from 'tailwind-variants';

const linkStyles = tv({
  base: 'transition-colors duration-200 cursor-pointer',
  variants: {
    variant: {
      default: 'text-gray-700 hover:bg-gray-100 rounded',
      nav: 'flex items-center p-2 text-gray-700 rounded hover:bg-gray-100',
      subNav: 'block p-2 text-gray-700 rounded hover:bg-gray-100',
    },
    isActive: {
      true: 'bg-gray-100',
    }
  },
  defaultVariants: {
    variant: 'default',
    isActive: false
  }
});

type LinkProps = ComponentProps<typeof NextLink> & 
  VariantProps<typeof linkStyles> & {
    className?: string;
  };

export default function Link({ 
  variant, 
  isActive, 
  className,
  children,
  ...props 
}: LinkProps) {
  return (
    <NextLink
      {...props}
      className={linkStyles({ variant, isActive, className })}
    >
      {children}
    </NextLink>
  );
} 