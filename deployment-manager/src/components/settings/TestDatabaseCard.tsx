'use client';

import { useState } from 'react';
import useSWR from 'swr';

import Switch from '~/components/general/Switch';
import Callout from '~/components/general/Callout';
import { showToast } from '~/components/general/Toaster';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';

interface TestDatabaseStatus {
  enabled: boolean;
  database?: string;
}

const ENV_KEYS = [
  'TEST_DATABASE_URL',
  'TEST_POSTGRES_HOST',
  'TEST_POSTGRES_DB',
  'TEST_POSTGRES_USER',
  'TEST_POSTGRES_PASSWORD',
];

export default function TestDatabaseCard({ app }: { app: App }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { data, mutate } = useSWR<TestDatabaseStatus>(
    `/api/apps/${app.id}/test-database`,
    fetcher
  );
  const enabled = data?.enabled === true;

  const handleToggle = async (next: boolean) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/test-database`, {
        method: next ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: next ? undefined : JSON.stringify({ enabled: false }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update test database');
      }
      await mutate();
      showToast(
        `Test database ${next ? 'enabled' : 'disabled'}. Redeploy for env changes to take effect.`,
        'success'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update test database', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-16 pt-16 border-t border-line-soft">
      <div className="border border-line rounded-menu overflow-hidden">
        <div className="flex items-start justify-between gap-16 px-14 py-12 bg-surface">
          <Switch
            checked={enabled}
            onChange={handleToggle}
            disabled={isUpdating || data === undefined}
            label="Test Database"
            hint={
              <>
                Provision a persistent, empty PostgreSQL database with separate credentials. It is
                available to production builds and containers after the next deploy.
                {data?.database ? (
                  <>
                    {' '}Database: <span className="font-mono text-meta">{data.database}</span>
                  </>
                ) : null}
              </>
            }
          />
        </div>
      </div>

      {enabled && (
        <Callout tone="info">
          These reserved variables will be injected on the next production deploy:
          <br />
          <span className="font-mono text-meta">{ENV_KEYS.join('  ')}</span>
          <br />
          Disabling stops injection but retains the database and its data for re-enabling.
        </Callout>
      )}
    </div>
  );
}
