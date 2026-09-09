'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AppFeature } from '~/types/appFeatures';
import fetcher from '~/utils/fetcher';
import Switch from '~/components/general/Switch';
import Callout from '~/components/general/Callout';
import { showToast } from '~/components/general/Toaster';
import { App } from '~/types';
import TestDatabaseCard from '~/components/settings/TestDatabaseCard';

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

  const handleTogglePrisma = async (next: boolean) => {
    setIsUpdatingPrisma(true);
    try {
      await patchFeature({
        feature: AppFeature.USES_PRISMA,
        enabled: next,
        config: { auto_migrate: next ? autoMigrate : false },
      });
      showToast(`Prisma CREATEDB ${next ? 'granted' : 'revoked'} successfully`, 'success');
    } catch {
      showToast('Failed to update Prisma setting', 'error');
    } finally {
      setIsUpdatingPrisma(false);
    }
  };

  const handleToggleAutoMigrate = async (next: boolean) => {
    setIsUpdatingMigrate(true);
    try {
      await patchFeature({
        feature: AppFeature.USES_PRISMA,
        enabled: true,
        config: { auto_migrate: next },
      });
      showToast(`Auto-migrate on deploy ${next ? 'enabled' : 'disabled'}`, 'success');
    } catch {
      showToast('Failed to update auto-migrate setting', 'error');
    } finally {
      setIsUpdatingMigrate(false);
    }
  };

  return (
    <div className="flex flex-col gap-16">
      <Callout tone="warning" title="Database migrations and zero-downtime deploys">
        When auto-migrate runs, SQL is applied to the live database while the previous deployment
        may still be serving traffic. Use expand/contract migrations so the old app version keeps
        working until traffic switches. Rolling back the app does not roll back the database.{' '}
        <a
          href="https://github.com/cfpg/port-au-next#prisma-migrations-and-expandcontract"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the guidance
        </a>
      </Callout>

      <div className="border border-line rounded-menu overflow-hidden">
        <div className="flex items-start justify-between gap-16 px-14 py-12 bg-surface border-b border-line-soft">
          <Switch
            checked={isEnabled}
            onChange={handleTogglePrisma}
            disabled={isUpdatingPrisma}
            label="Uses Prisma"
            hint={
              <>
                Grants CREATEDB on the app database user for Prisma shadow databases. When this app
                has no custom Dockerfile in git, the platform maintains a generated Dockerfile
                (Node 24, <span className="font-mono text-meta">prisma generate</span> at build) on
                the next deploy. Commit your own Dockerfile to override — if you enable
                auto-migrate, add a <span className="font-mono text-meta">migrator</span> stage (see
                README).
              </>
            }
          />
        </div>
        <div className={`flex items-start justify-between gap-16 px-14 py-12 ${isEnabled ? 'bg-surface' : 'bg-paper'}`}>
          <Switch
            checked={autoMigrate}
            onChange={handleToggleAutoMigrate}
            disabled={isUpdatingMigrate || !isEnabled}
            label="Run migrations on deploy"
            hint={
              <>
                After the new container starts, run{' '}
                <span className="font-mono text-meta">prisma migrate status</span> and{' '}
                <span className="font-mono text-meta">prisma migrate deploy</span> in a one-off job,
                then switch traffic. Requires{' '}
                <span className="font-mono text-meta">prisma/migrations/</span> in the repo.
              </>
            }
          />
        </div>
      </div>

      <TestDatabaseCard app={app} />
    </div>
  );
}
