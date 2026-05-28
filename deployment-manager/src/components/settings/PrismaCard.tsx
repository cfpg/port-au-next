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
  const [isUpdatingPrisma, setIsUpdatingPrisma] = useState(false);
  const [isUpdatingMigrate, setIsUpdatingMigrate] = useState(false);

  const { data: features, mutate: mutateFeatures } = useSWR(
    `/api/apps/${app.id}/features`,
    fetcher
  );

  const isEnabled = features?.[AppFeature.USES_PRISMA]?.enabled || false;
  const autoMigrate =
    features?.[AppFeature.USES_PRISMA]?.config?.auto_migrate === true;

  const patchFeature = async (body: {
    feature: AppFeature;
    enabled: boolean;
    config?: Record<string, unknown>;
  }) => {
    const response = await fetch(`/api/apps/${app.id}/features`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error('Failed to update feature');
    }
    await mutateFeatures();
  };

  const handleTogglePrisma = async () => {
    setIsUpdatingPrisma(true);
    try {
      await patchFeature({
        feature: AppFeature.USES_PRISMA,
        enabled: !isEnabled,
        config: { auto_migrate: !isEnabled ? autoMigrate : false },
      });
      showToast(
        `Prisma CREATEDB ${!isEnabled ? 'granted' : 'revoked'} successfully`,
        'success'
      );
    } catch {
      showToast('Failed to update Prisma setting', 'error');
    } finally {
      setIsUpdatingPrisma(false);
    }
  };

  const handleToggleAutoMigrate = async () => {
    setIsUpdatingMigrate(true);
    try {
      await patchFeature({
        feature: AppFeature.USES_PRISMA,
        enabled: true,
        config: { auto_migrate: !autoMigrate },
      });
      showToast(
        `Auto-migrate on deploy ${!autoMigrate ? 'enabled' : 'disabled'}`,
        'success'
      );
    } catch {
      showToast('Failed to update auto-migrate setting', 'error');
    } finally {
      setIsUpdatingMigrate(false);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        role="note"
      >
        <p className="font-medium">Database migrations and zero-downtime deploys</p>
        <p className="mt-2 text-amber-900/90">
          When auto-migrate runs, SQL is applied to the <strong>live</strong> database while the
          previous deployment may still be serving traffic. Use{' '}
          <strong>expand/contract</strong> migrations so the old app version keeps working until
          traffic switches. Rolling back the app does <strong>not</strong> roll back the database.
        </p>
        <p className="mt-2">
          <a
            href="https://github.com/cfpg/port-au-next#prisma-migrations-and-expandcontract"
            className="font-medium text-amber-950 underline hover:text-amber-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read expand/contract guidance in the README
          </a>
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Uses Prisma</h3>
          <p className="text-sm text-gray-500">
            Grants CREATEDB on the app database user for Prisma shadow databases. When this app has
            no custom Dockerfile in git, the platform maintains a generated Dockerfile (Node 24,{' '}
            <code className="text-xs">prisma generate</code> at build) on the next deploy. Commit
            your own Dockerfile to override — if you enable auto-migrate, add a{' '}
            <code className="text-xs">migrator</code> stage (see README).
          </p>
        </div>
        <Button
          color={isEnabled ? 'green' : 'gray'}
          onClick={handleTogglePrisma}
          disabled={isUpdatingPrisma}
        >
          {isEnabled ? 'Enabled' : 'Disabled'}
        </Button>
      </div>

      {isEnabled && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div>
            <h4 className="text-base font-medium">Run migrations on deploy</h4>
            <p className="text-sm text-gray-500">
              After the new container starts, run{' '}
              <code className="text-xs">prisma migrate status</code> and{' '}
              <code className="text-xs">prisma migrate deploy</code> in a one-off job, then switch
              traffic. Requires <code className="text-xs">prisma/migrations/</code> in the repo.
            </p>
          </div>
          <Button
            color={autoMigrate ? 'green' : 'gray'}
            onClick={handleToggleAutoMigrate}
            disabled={isUpdatingMigrate}
          >
            {autoMigrate ? 'Enabled' : 'Disabled'}
          </Button>
        </div>
      )}
    </div>
  );
}
