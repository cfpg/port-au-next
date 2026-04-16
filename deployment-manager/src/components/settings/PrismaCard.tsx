'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AppFeature } from '~/types/appFeatures';
import fetcher from '~/utils/fetcher';
import Button from '~/components/general/Button';
import { showToast } from '~/components/general/Toaster';
import { App } from '~/types';

interface PrismaCardProps {
  app: App;
}

export default function PrismaCard({ app }: PrismaCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: features, mutate: mutateFeatures } = useSWR(
    `/api/apps/${app.id}/features`,
    fetcher
  );

  const isEnabled = features?.[AppFeature.USES_PRISMA]?.enabled || false;

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/features`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feature: AppFeature.USES_PRISMA,
          enabled: !isEnabled,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update feature');
      }

      await mutateFeatures();
      showToast(`Prisma CREATEDB ${!isEnabled ? 'granted' : 'revoked'} successfully`, 'success');
    } catch (error) {
      showToast('Failed to update Prisma setting', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Uses Prisma</h3>
          <p className="text-sm text-gray-500">
            Grants CREATEDB to the app database user, required for Prisma shadow database during migrations
          </p>
        </div>
        <Button
          color={isEnabled ? 'green' : 'gray'}
          onClick={handleToggle}
          disabled={isUpdating}
        >
          {isEnabled ? 'Enabled' : 'Disabled'}
        </Button>
      </div>
    </div>
  );
}
