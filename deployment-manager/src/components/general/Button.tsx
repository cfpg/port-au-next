import { tv } from 'tailwind-variants';

const button = tv({
  base: 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  variants: {
    color: {
      primary: 'text-indigo-600 hover:text-indigo-900 focus:ring-indigo-500',
      blue: 'text-blue-600 hover:text-blue-900 focus:ring-blue-500',
      green: 'text-green-600 hover:text-green-900 focus:ring-green-500',
      yellow: 'text-yellow-600 hover:text-yellow-900 focus:ring-yellow-500',
      red: 'text-red-600 hover:text-red-900 focus:ring-red-500',
    },
    size: {
      sm: 'text-sm px-2 py-1',
      md: 'text-sm px-3 py-2',
      lg: 'text-base px-4 py-2',
    },
  },
  defaultVariants: {
    color: 'primary',
    size: 'md',
  },
});

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: 'primary' | 'blue' | 'green' | 'yellow' | 'red';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export default function Button({ 
  color, 
  size, 
  className, 
  children, 
  ...props 
}: ButtonProps) {
  return (
    <button className={button({ color, size, className })} {...props}>
      {children}
    </button>
  );
} 