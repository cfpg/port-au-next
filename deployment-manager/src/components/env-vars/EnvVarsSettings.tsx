'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { EnvVarsForm } from '~/components/EnvVarsForm';
import Select from '~/components/general/Select';
import fetcher from '~/utils/fetcher';
import { App } from '~/types';

interface EnvVarsSettingsProps {
  app: App;
}

export default function EnvVarsSettings({ app }: EnvVarsSettingsProps) {
  const [isPreview, setIsPreview] = useState(false);
  const { data: envVars, error } = useSWR(
    `/api/apps/${app.id}/env-vars?isPreview=${isPreview}`,
    fetcher
  );

  if (error) {
    return <div className="text-red-500">Failed to load environment variables</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select
          id="env-type"
          label="Environment Type"
          value={isPreview ? 'Preview' : 'Production'}
          onChange={(e) => setIsPreview(e.target.value === 'Preview')}
          options={[
            { value: 'Production', label: 'Production' },
            { value: 'Preview', label: 'Preview' },
          ]}
          className="w-48"
        />
      </div>

      <EnvVarsForm
        app={app}
        isPreview={isPreview}
        initialEnvVars={envVars || []}
      />
    </div>
  );
} 