"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from '~/components/general/Link';
import getSingleAppPath from '~/utils/getSingleAppPath';

interface SidebarProps {
  apps: any[];
}

export default function Sidebar({ apps }: SidebarProps) {
  const pathname = usePathname();

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

  const getNavClassName = (path: string) => {
    return isActive(path) ? 'bg-gray-100 text-blue-600' : '';
  };

  return (
    <nav className="p-4 h-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Port-au-Next</h1>
        <button onClick={() => setIsNavOpen(!isNavOpen)} className="md:hidden">
          <i className="fas fa-bars" />
        </button>
      </div>
      
      <ul className={`space-y-2 h-0 md:h-auto overflow-y-auto transition-all duration-300 ease-in-out ${isNavOpen ? 'h-auto' : 'h-0'}`}>
        <li className="mt-8">
          <Link 
            href="/" 
            variant="nav"
            className={getNavClassName('/')}
          >
            <i className="fas fa-home mr-3" />
            Dashboard
          </Link>
        </li>
        <li>
          <Link 
            href="/apps" 
            variant="nav"
            className={getNavClassName('/apps')}
          >
            <i className="fas fa-rocket mr-3" />
            Applications
          </Link>
          <ul className="ml-6 hidden md:block">
            {apps.map((app) => (
              <li key={app.id}>
                <Link 
                  href={getSingleAppPath(app.name)} 
                  variant="subNav"
                  className={getNavClassName(getSingleAppPath(app.name))}
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
                <i className="fas fa-plus mr-3" />
                Add App
              </Link>
            </li>
          </ul>
        </li>
        <li>
          <Link 
            href="/settings" 
            variant="nav"
            className={getNavClassName('/settings')}
          >
            <i className="fas fa-gear mr-3" />
            Settings
          </Link>
        </li>
      </ul>
    </nav>
  );
} 