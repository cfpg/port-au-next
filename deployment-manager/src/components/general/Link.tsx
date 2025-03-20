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
      button: 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
    },
    color: {
      primary: '',
      blue: '',
      green: '',
      yellow: '',
      red: '',
      gray: '',
    },
    size: {
      sm: 'text-sm px-2 py-1',
      md: 'text-sm px-3 py-2',
      lg: 'text-base px-4 py-2',
    },
    isActive: {
      true: 'bg-gray-100',
    }
  },
  compoundVariants: [
    {
      variant: 'button',
      color: 'primary',
      class: 'bg-indigo-600 text-white hover:bg-indigo-900 focus:ring-indigo-500'
    },
    {
      variant: 'button',
      color: 'blue',
      class: 'bg-blue-600 text-white hover:bg-blue-900 focus:ring-blue-500'
    },
    {
      variant: 'button',
      color: 'green',
      class: 'bg-green-600 text-white hover:bg-green-900 focus:ring-green-500'
    },
    {
      variant: 'button',
      color: 'yellow',
      class: 'bg-yellow-600 text-white hover:bg-yellow-900 focus:ring-yellow-500'
    },
    {
      variant: 'button',
      color: 'red',
      class: 'bg-red-600 text-white hover:bg-red-900 focus:ring-red-500'
    }, 
    {
      variant: 'button',
      color: 'gray',
      class: 'bg-gray-100 text-gray-900 hover:bg-gray-300 focus:ring-gray-500'
    }
  ],
  defaultVariants: {
    variant: 'default',
    isActive: false,
    size: 'md',
    color: 'primary'
  }
});

type LinkProps = ComponentProps<typeof NextLink> & 
  VariantProps<typeof linkStyles> & {
    className?: string;
  };

export default function Link({ 
  variant, 
  color,
  size,
  isActive, 
  className,
  children,
  ...props 
}: LinkProps) {
  return (
    <NextLink
      {...props}
      className={linkStyles({ variant, color, size, isActive, className })}
    >
      {children}
    </NextLink>
  );
} 