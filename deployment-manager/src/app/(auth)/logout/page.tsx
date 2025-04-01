'use client';

import { useEffect } from 'react';
import { signOut } from '~/lib/auth-client';
import { useRouter } from 'next/navigation';
import Card from '~/components/general/Card';

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
    <div className="w-full max-w-md">
      <Card
        title="Signing Out"
        content={
          <div className="text-center py-4">
            <p className="text-gray-700">You are being signed out...</p>
          </div>
        }
      />
    </div>
  );
} 