"use client";

import Link from '~/components/general/Link';
import { usePathname } from 'next/navigation';

interface AppNavigationProps {
  appName: string;
}

/** Switches views of this one app - shares the kit Tabs' visual language. */
export default function AppNavigation({ appName }: AppNavigationProps) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === `/apps/${appName}`) {
      return pathname === path;
    }
    return pathname.startsWith(path);
  };

  const navItems = [
    { href: `/apps/${appName}`, label: 'Overview' },
    { href: `/apps/${appName}/envvars`, label: 'Env Vars' },
    { href: `/apps/${appName}/settings`, label: 'Settings' },
  ];

  return (
    <div className="flex gap-2 px-9 py-7 bg-paper border border-line rounded-panel mb-16" role="tablist">
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            variant="default"
            aria-selected={active}
            role="tab"
            className={[
              'font-display font-semibold text-field rounded-control px-13 py-7 border',
              'transition-colors duration-100 focus-ring',
              active ? 'bg-surface text-ink border-line shadow-panel' : 'bg-transparent border-transparent text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
