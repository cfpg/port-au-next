'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { EnvVarsForm } from '~/components/EnvVarsForm';
import fetcher from '~/utils/fetcher';

interface EnvVarsSettingsProps {
  appId: number;
}

export default function EnvVarsSettings({ appId }: EnvVarsSettingsProps) {
  const [isPreview, setIsPreview] = useState(false);
  const { data: envVars, error } = useSWR(
    `/api/apps/${appId}/env-vars?isPreview=${isPreview}`,
    fetcher
  );

  if (error) {
    return <div className="text-red-500">Failed to load environment variables</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label htmlFor="env-type" className="text-sm font-medium text-gray-700">
          Environment Type:
        </label>
        <select
          id="env-type"
          value={isPreview ? 'preview' : 'production'}
          onChange={(e) => setIsPreview(e.target.value === 'preview')}
          className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          <option value="production">Production</option>
          <option value="preview">Preview</option>
        </select>
      </div>

      <EnvVarsForm
        appId={appId}
        branch={isPreview ? 'preview' : 'main'}
        initialEnvVars={envVars || []}
      />
    </div>
  );
} 