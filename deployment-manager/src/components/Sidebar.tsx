"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from '~/components/general/Link';
import Avatar from '~/components/general/Avatar';
import Brand from '~/components/general/Brand';
import { HomeIcon, GridIcon, GearIcon, PlusIcon, MenuIcon } from '~/components/general/icons';
import getSingleAppPath from '~/utils/getSingleAppPath';
import { useSession } from '~/lib/auth-client';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';

interface SidebarProps {
  /** Server-rendered fallback for the first paint - kept fresh afterward via SWR below. */
  apps: App[];
}

export default function Sidebar({ apps: initialApps }: SidebarProps) {
  const pathname = usePathname();
  const { data } = useSession();
  const [isNavOpen, setIsNavOpen] = useState(false);

  // The layout that renders this is a server component, refetched only on navigation - it
  // wouldn't otherwise pick up a deployment queued from another tab, or one just queued on
  // the current page, while sitting still. Polling the same '/api/apps' key the homepage
  // Applications table already uses keeps ordering/activity in sync with that surface, and
  // a deploy-trigger's mutate('/api/apps') call (see AppDeployButton, etc.) refreshes it
  // immediately rather than waiting out the interval.
  const { data: apps = initialApps } = useSWR<App[]>('/api/apps', fetcher, {
    fallbackData: initialApps,
    refreshInterval: 10000,
  });

  useEffect(() => {
    if (window.innerWidth > 768) {
      setIsNavOpen(true);
    }
  }, []);

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === path;
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-9 px-14 py-13 border-b border-line-soft">
        <Brand />
        <button
          type="button"
          onClick={() => setIsNavOpen(!isNavOpen)}
          className="md:hidden inline-flex items-center justify-center size-26 bg-surface text-ink-muted border border-line-strong rounded-control cursor-pointer transition-colors duration-150 hover:bg-paper hover:text-ink focus-ring"
          aria-label="Toggle navigation"
        >
          <MenuIcon size={15} />
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto p-8 ${isNavOpen ? 'block' : 'hidden'} md:block`}>
        <Link href="/" variant="nav" isActive={isActive('/')}>
          <HomeIcon />
          Dashboard
        </Link>
        <Link href="/apps" variant="nav" isActive={isActive('/apps')} className="mt-2">
          <GridIcon />
          Applications
        </Link>

        <div className="mt-4 mb-2 ml-9 pl-9 border-l border-line-soft">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={getSingleAppPath(app.name)}
              variant="subNav"
              isActive={isActive(getSingleAppPath(app.name))}
            >
              {app.domain || app.name}
            </Link>
          ))}
          <Link href="/#new" variant="nav" className="mt-2 text-primary! hover:bg-primary-tint! hover:text-primary-active!">
            <PlusIcon />
            Add App
          </Link>
        </div>

        <Link href="/settings" variant="nav" isActive={isActive('/settings')} className="mt-6">
          <GearIcon />
          Settings
        </Link>
      </div>

      {data?.user && (
        <div className="flex items-center gap-9 px-13 py-11 border-t border-line-soft">
          <Avatar name={data.user.name} size="md" />
          <div className="min-w-0">
            <div className="font-display font-semibold text-label">{data.user.name}</div>
            <div className="font-mono text-micro text-ink-faint truncate">{data.user.email}</div>
          </div>
        </div>
      )}
    </nav>
  );
}
