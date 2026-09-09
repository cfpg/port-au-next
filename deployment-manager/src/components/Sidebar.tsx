"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from '~/components/general/Link';
import Avatar from '~/components/general/Avatar';
import getSingleAppPath from '~/utils/getSingleAppPath';
import { useSession } from '~/lib/auth-client';

interface SidebarProps {
  apps: any[];
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
    <nav className="p-4 h-auto flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Port-au-Next</h1>
        <button onClick={() => setIsNavOpen(!isNavOpen)} className="md:hidden">
          <i className="fas fa-bars" />
        </button>
      </div>
      
      <ul className={`space-y-2 h-0 md:h-auto overflow-y-auto transition-all duration-300 ease-in-out mb-8  ${isNavOpen ? 'h-auto' : 'h-0'}`}>
        <li className="mt-8">
          <Link
            href="/"
            variant="nav"
            isActive={isActive('/')}
          >
            <i className="fas fa-home" />
            Dashboard
          </Link>
        </li>
        <li>
          <Link
            href="/apps"
            variant="nav"
            isActive={isActive('/apps')}
            className="mb-2"
          >
            <i className="fas fa-rocket" />
            Applications
          </Link>
          <ul className="ml-6 hidden md:block space-y-2">
            {apps.map((app) => (
              <li key={app.id}>
                <Link
                  href={getSingleAppPath(app.name)}
                  variant="subNav"
                  isActive={isActive(getSingleAppPath(app.name))}
                >
                  {app.domain}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/#new"
                variant="nav"
              >
                <i className="fas fa-plus" />
                Add App
              </Link>
            </li>
          </ul>
        </li>
        <li>
          <Link
            href="/settings"
            variant="nav"
            isActive={isActive('/settings')}
          >
            <i className="fas fa-gear" />
            Settings
          </Link>
        </li>
      </ul>

      {data?.user && (
        <div className="mt-auto pt-8 border-t border-gray-200">
          <div className="flex items-center space-x-3">
            <Avatar name={data.user.name} />
            <div>
              <div className="text-sm font-medium text-gray-900">{data.user.name}</div>
              <div className="text-xs text-gray-500">{data.user.email}</div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
} 