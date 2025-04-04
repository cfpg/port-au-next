"use client";

import { tv, VariantProps } from 'tailwind-variants';
import { useState, useRef, useEffect } from 'react';

const button = tv({
  slots: {
    wrapper: 'inline-flex relative',
    base: [
      'inline-flex items-center cursor-pointer justify-center font-medium',
      'transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:pointer-events-none'
    ],
    mainButton: [
      'rounded-l-md rounded-r-md',
      '[&.has-dropdown]:rounded-r-none'
    ],
    dropdownButton: [
      'rounded-r-md rounded-l-none border-l border-opacity-10',
      'hover:bg-opacity-75'
    ],
    dropdownPanel: [
      'absolute top-full right-0 w-48 rounded-md shadow-lg overflow-hidden',
      'border border-gray-100 z-50',
    ],
    dropdownItem: [
      'w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer',
      'first:rounded-t-md last:rounded-b-md',
    ]
  },
  variants: {
    color: {
      primary: {
        base: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
        dropdownButton: 'border-indigo-500 hover:bg-indigo-700',
        dropdownPanel: 'bg-indigo-600 border-indigo-500',
        dropdownItem: 'text-white hover:bg-indigo-700'
      },
      blue: {
        base: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
        dropdownButton: 'border-blue-500 hover:bg-blue-700',
        dropdownPanel: 'bg-blue-600 border-blue-500',
        dropdownItem: 'text-white hover:bg-blue-700'
      },
      green: {
        base: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
        dropdownButton: 'border-green-500 hover:bg-green-700',
        dropdownPanel: 'bg-green-600 border-green-500',
        dropdownItem: 'text-white hover:bg-green-700'
      },
      yellow: {
        base: 'bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500',
        dropdownButton: 'border-yellow-500 hover:bg-yellow-700',
        dropdownPanel: 'bg-yellow-600 border-yellow-500',
        dropdownItem: 'text-white hover:bg-yellow-700'
      },
      red: {
        base: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        dropdownButton: 'border-red-500 hover:bg-red-700',
        dropdownPanel: 'bg-red-600 border-red-500',
        dropdownItem: 'text-white hover:bg-red-700'
      },
      gray: {
        base: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
        dropdownButton: 'border-gray-500 hover:bg-gray-700',
        dropdownPanel: 'bg-gray-600 border-gray-500',
        dropdownItem: 'text-white hover:bg-gray-700'
      },
      'gray-light': {
        base: 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500',
        dropdownButton: 'border-gray-400 hover:bg-gray-300',
        dropdownPanel: 'bg-gray-200 border-gray-300',
        dropdownItem: 'text-gray-700 hover:bg-gray-300'
      },
      white: {
        base: 'bg-white text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
        dropdownButton: 'border-gray-300 hover:bg-gray-100',
        dropdownPanel: 'bg-white border-gray-200',
        dropdownItem: 'text-gray-700 hover:bg-gray-100'
      },
      transparent: {
        base: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
        dropdownButton: 'border-gray-300 hover:bg-gray-100',
        dropdownPanel: 'bg-white border-gray-200',
        dropdownItem: 'text-gray-700 hover:bg-gray-100'
      },
    },
    size: {
      sm: {
        base: 'text-sm px-2 py-1',
        dropdownButton: 'px-2 py-1'
      },
      md: {
        base: 'text-sm px-3 py-2',
        dropdownButton: 'px-2 py-2'
      },
      lg: {
        base: 'text-base px-4 py-2',
        dropdownButton: 'px-3 py-2'
      },
    },
    disabled: {
      true: { base: "cursor-not-allowed" },
    }
  },
  defaultVariants: {
    color: 'primary',
    size: 'sm',
  },
});

interface DropdownItem {
  label: string;
  onClick: () => void;
}

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>, VariantProps<typeof button> {
  children: React.ReactNode;
  dropdown?: DropdownItem[];
}

export default function Button({ 
  color, 
  size, 
  className, 
  children,
  disabled,
  dropdown,
  onClick,
  ...props 
}: ButtonProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const styles = button({ color, size, className, disabled });

  if (!dropdown) {
    return (
      <button className={styles.base({ className: styles.mainButton() })} disabled={disabled} onClick={onClick} {...props}>
        {children}
      </button>
    );
  }

  return (
    <div className={styles.wrapper()} ref={dropdownRef}>
      <button 
        className={styles.base({ className: [styles.mainButton(), 'has-dropdown'] })}
        disabled={disabled} 
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
      <button
        className={styles.base({ className: styles.dropdownButton() })}
        onClick={(e) => {
          e.stopPropagation();
          setIsDropdownOpen(!isDropdownOpen);
        }}
        disabled={disabled}
      >
        <i className="fas fa-chevron-down" />
      </button>
      {isDropdownOpen && (
        <div className={styles.dropdownPanel()}>
          {dropdown.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick();
                setIsDropdownOpen(false);
              }}
              className={styles.dropdownItem()}
              role="menuitem"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}