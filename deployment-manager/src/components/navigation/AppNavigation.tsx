"use client";

import { tv } from 'tailwind-variants';
import Link from '~/components/general/Link';
import { usePathname } from 'next/navigation';

const appNavigation = tv({
  slots: {
    base: 'mb-8',
    list: 'flex gap-1 p-1 bg-gray-50 rounded-lg border border-gray-400 shadow-sm py-4 px-2',
    item: 'relative',
    link: [
      'px-2 py-2 text-sm font-medium transition-colors rounded-md',
      'text-gray-600 hover:text-gray-900',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
    ],
    activeLink: [
      'px-2 py-2 text-sm font-medium transition-colors rounded-md bg-blue-50 border border-blue-200',
      'text-blue-600 font-semibold',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
    ]
  },
  variants: {
    size: {
      sm: {
        link: 'text-xs px-3 py-1.5',
        activeLink: 'text-xs px-3 py-1.5',
      },
      md: {
        link: 'text-sm px-4 py-2',
        activeLink: 'text-sm px-4 py-2',
      },
      lg: {
        link: 'text-base px-5 py-2.5',
        activeLink: 'text-base px-5 py-2.5',
      }
    }
  },
  defaultVariants: {
    size: 'md'
  }
});

interface AppNavigationProps {
  appName: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function AppNavigation({ appName, size }: AppNavigationProps) {
  const pathname = usePathname();
  const styles = appNavigation({ size });

  const isActive = (path: string) => {
    if (path === `/apps/${appName}`) {
      return pathname === path;
    }
    return pathname.startsWith(path);
  };

  const navItems = [
    { href: `/apps/${appName}`, label: 'Overview' },
    { href: `/apps/${appName}/settings`, label: 'Settings' },
  ];

  return (
    <nav className={styles.base()}>
      <ul className={styles.list()}>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className={styles.item()}>
              <Link
                href={item.href}
                className={active ? styles.activeLink() : styles.link()}
                variant="default"
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
} 