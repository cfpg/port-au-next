import { tv } from 'tailwind-variants';

const input = tv({
  base: 'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
  variants: {},
  defaultVariants: {},
});

const label = tv({
  base: 'block text-sm font-medium text-gray-700 mb-2',
  variants: {},
  defaultVariants: {},
});

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ className, type = 'text', label: labelText, ...props }: InputProps) {
  return (
    <div>
      {labelText && (
        <label htmlFor={props.id} className={label()}>
          {labelText}
        </label>
      )}
      <input type={type} className={input({ className })} {...props} />
    </div>
  );
} 