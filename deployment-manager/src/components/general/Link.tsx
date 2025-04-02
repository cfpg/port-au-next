import { ComponentProps } from 'react';
import { default as NextLink } from 'next/link';
import { tv, type VariantProps } from 'tailwind-variants';

const linkStyles = tv({
  base: 'transition-colors duration-200 cursor-pointer',
  variants: {
    variant: {
      default: 'text-gray-700',
      nav: 'flex items-center p-2 text-gray-700 rounded hover:bg-gray-100',
      subNav: 'block p-2 text-gray-700 rounded hover:bg-gray-100',
      button: 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
    },
    color: {
      primary: 'text-blue-600 hover:text-blue-900',
      blue: 'text-blue-600 hover:text-blue-900',
      green: 'text-green-600 hover:text-green-900',
      yellow: 'text-yellow-600 hover:text-yellow-900',
      red: 'text-red-600 hover:text-red-900',
      gray: 'text-gray-700 hover:text-gray-900',
    },
    size: {
      sm: 'text-sm px-2 py-1',
      md: 'text-sm px-3 py-2',
      lg: 'text-base px-4 py-2',
    },
    isActive: {
      true: 'bg-gray-100',
    },
    underline: {
      true: 'underline',
      false: 'no-underline',
    }
  },
  compoundVariants: [
    {
      variant: "nav",
      class: 'no-underline',
    },
    {
      variant: "subNav",
      class: 'no-underline',
    },
    {
      variant: 'button',
      color: 'primary',
      class: 'bg-indigo-600 text-white hover:bg-indigo-900 hover:text-white focus:ring-indigo-500 no-underline'
    },
    {
      variant: 'button',
      color: 'blue',
      class: 'bg-blue-600 text-white hover:bg-blue-900 hover:text-white focus:ring-blue-500 no-underline'
    },
    {
      variant: 'button',
      color: 'green',
      class: 'bg-green-600 text-white hover:bg-green-900 hover:text-white focus:ring-green-500 no-underline'
    },
    {
      variant: 'button',
      color: 'yellow',
      class: 'bg-yellow-600 text-white hover:bg-yellow-900 hover:text-white focus:ring-yellow-500 no-underline'
    },
    {
      variant: 'button',
      color: 'red',
      class: 'bg-red-600 text-white hover:bg-red-900 hover:text-white focus:ring-red-500 no-underline'
    },
    {
      variant: 'button',
      color: 'gray',
      class: 'bg-gray-100 text-gray-900 hover:bg-gray-300 hover:text-gray-900 focus:ring-gray-500 no-underline'
    }
  ],
  defaultVariants: {
    variant: 'default',
    isActive: false,
    size: 'md',
    color: 'primary',
    underline: true,
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