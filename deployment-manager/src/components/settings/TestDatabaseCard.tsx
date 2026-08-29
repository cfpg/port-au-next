'use client';

import { useState } from 'react';
import useSWR from 'swr';

import Button from '~/components/general/Button';
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

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/test-database`, {
        method: enabled ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: enabled ? JSON.stringify({ enabled: false }) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update test database');
      }
      await mutate();
      showToast(
        `Test database ${enabled ? 'disabled' : 'enabled'}. Redeploy for env changes to take effect.`,
        'success'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update test database', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="border-t border-gray-100 pt-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h3 className="text-lg font-medium">Test Database</h3>
          <p className="text-sm text-gray-500">
            Provision a persistent, empty PostgreSQL database with separate credentials. It is
            available to production builds and containers after the next deploy.
          </p>
          {data?.database && (
            <p className="mt-2 text-sm text-gray-500">
              Database: <code className="text-xs">{data.database}</code>
            </p>
          )}
        </div>
        <Button
          color={enabled ? 'green' : 'gray'}
          onClick={handleToggle}
          disabled={isUpdating || data === undefined}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </Button>
      </div>

      {enabled && (
        <div className="mt-4 rounded-md bg-blue-50 p-4 text-sm text-blue-800">
          <p>These reserved variables will be injected on the next production deploy:</p>
          <code className="mt-2 block text-xs leading-5">{ENV_KEYS.join('\n')}</code>
          <p className="mt-2">
            Disabling stops injection but retains the database and its data for re-enabling.
          </p>
        </div>
      )}
    </div>
  );
}
