'use client';

import { useEffect } from 'react';
import { signOut } from '~/lib/auth-client';
import { useRouter } from 'next/navigation';
import Spinner from '~/components/general/Spinner';
import CodeToken from '~/components/general/CodeToken';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const handleLogout = async () => {
      await signOut();
      router.push('/login');
    };

    handleLogout();
  }, [router]);

  return (
    <div className="w-full max-w-380 bg-surface border border-line rounded-panel shadow-panel overflow-hidden">
      <div className="flex flex-col items-center gap-9 px-22 py-32 text-center">
        <Spinner size={22} />
        <div className="font-display font-semibold text-body mt-4">Signing out</div>
        <div className="text-field text-ink-muted">Clearing cookies...</div>
      </div>
      <div className="h-2 bg-line-soft overflow-hidden">
        <div className="h-full bg-[linear-gradient(90deg,var(--color-line-soft)_0%,var(--color-primary)_50%,var(--color-line-soft)_100%)] bg-[length:220px_100%] animate-shimmer" />
      </div>
      <div className="px-14 py-11 bg-paper border-t border-line text-center">
        <span className="font-mono text-mini text-ink-faint">redirecting to <CodeToken>/login</CodeToken></span>
      </div>
    </div>
  );
}
