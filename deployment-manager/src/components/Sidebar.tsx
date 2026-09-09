"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from '~/components/general/Link';
import Avatar from '~/components/general/Avatar';
import { HomeIcon, GridIcon, GearIcon, PlusIcon, MenuIcon } from '~/components/general/icons';
import getSingleAppPath from '~/utils/getSingleAppPath';
import { useSession } from '~/lib/auth-client';
import { App } from '~/types';

interface SidebarProps {
  apps: App[];
}

export default function Sidebar({ apps }: SidebarProps) {
  const pathname = usePathname();
  const { data } = useSession();
  const [isNavOpen, setIsNavOpen] = useState(false);

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
        <div className="flex items-center gap-9">
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
            <defs>
              <linearGradient id="pan-sidebar-sun" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#F0A53C" />
                <stop offset="1" stopColor="#E2553B" />
              </linearGradient>
            </defs>
            <path d="M10 31 A14 14 0 0 1 38 31 Z" fill="url(#pan-sidebar-sun)" />
            <line x1="14" y1="23.5" x2="34" y2="23.5" stroke="#fff" strokeWidth="2" />
            <line x1="11.5" y1="28" x2="36.5" y2="28" stroke="#fff" strokeWidth="2" />
            <line x1="8" y1="35" x2="40" y2="35" stroke="#3E7C8C" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span className="font-display font-semibold text-body tracking-brand">Port-Au-Next</span>
        </div>
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
