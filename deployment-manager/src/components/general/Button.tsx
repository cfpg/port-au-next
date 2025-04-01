"use client";

import { tv, VariantProps } from 'tailwind-variants';

const button = tv({
  base: 'inline-flex items-center cursor-pointer justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  variants: {
    color: {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-900 focus:ring-indigo-500',
      blue: 'bg-blue-600 text-white hover:bg-blue-900 focus:ring-blue-500',
      green: 'bg-green-600 text-white hover:bg-green-900 focus:ring-green-500',
      yellow: 'bg-yellow-600 text-white hover:bg-yellow-900 focus:ring-yellow-500',
      red: 'bg-red-600 text-white hover:bg-red-900 focus:ring-red-500',
      gray: 'bg-gray-600 text-white hover:bg-gray-900 focus:ring-gray-500',
      'gray-light': 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500',
      white: 'bg-white text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
      transparent: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    },
    size: {
      sm: 'text-sm px-2 py-1',
      md: 'text-sm px-3 py-2',
      lg: 'text-base px-4 py-2',
    },
    disabled: {
      true: "cursor-not-allowed",
    }
  },
  defaultVariants: {
    color: 'primary',
    size: 'md',
  },
});

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>, VariantProps<typeof button> {
  children: React.ReactNode;
}

export default function Button({ 
  color, 
  size, 
  className, 
  children,
  disabled,
  ...props 
}: ButtonProps) {
  return (
    <button className={button({ color, size, className, disabled })} disabled={disabled} {...props}>
      {children}
    </button>
  );
} 