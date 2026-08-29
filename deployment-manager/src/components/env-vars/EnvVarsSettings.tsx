'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { EnvVarsForm } from '~/components/EnvVarsForm';
import ImportEnvVarsModal from '~/components/env-vars/ImportEnvVarsModal';
import Select from '~/components/general/Select';
import Button from '~/components/general/Button';
import fetcher from '~/utils/fetcher';
import { App } from '~/types';
import { AppEnvVar } from '~/queries/fetchAppEnvVars';
import { showToast } from '~/components/general/Toaster';
import type { ExportPostgresHost } from '~/services/appEnv';

interface EnvVarsSettingsProps {
  app: App;
}

export default function EnvVarsSettings({ app }: EnvVarsSettingsProps) {
  const [isPreview, setIsPreview] = useState(false);
  const [envVars, setEnvVars] = useState<AppEnvVar[]>([]);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportHost, setExportHost] = useState<ExportPostgresHost>('host.docker.internal');

  // Fetch both production and preview environment variables
  const { data: productionEnvVars, error: productionError, mutate: mutateProduction } = useSWR(
    `/api/apps/${app.id}/env-vars?isPreview=false`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  
  const { data: previewEnvVars, error: previewError, mutate: mutatePreview } = useSWR(
    `/api/apps/${app.id}/env-vars?isPreview=true`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  // Update the envVars state when the selected environment changes
  useEffect(() => {
    const newEnvVars = isPreview ? previewEnvVars : productionEnvVars;
    if (newEnvVars) {
      setEnvVars(newEnvVars);
      setUnsavedChanges(false);
    }
  }, [isPreview, productionEnvVars, previewEnvVars]);

  // Use the appropriate error based on the selected environment
  const error = isPreview ? previewError : productionError;
  const isLoading = isPreview 
    ? previewEnvVars === undefined && !previewError 
    : productionEnvVars === undefined && !productionError;

  // Handlers for the EnvVarsForm
  const handleAdd = () => {
    setEnvVars([...envVars, { 
      key: '', 
      value: '', 
      branch: null,
      is_preview: isPreview 
    }]);
    setUnsavedChanges(true);
  };

  const handleRemove = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
    setUnsavedChanges(true);
  };

  const handleChange = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index] = { 
      ...newEnvVars[index], 
      [field]: value,
      is_preview: isPreview
    };
    setEnvVars(newEnvVars);
    setUnsavedChanges(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out empty keys and ensure is_preview is set correctly
    const validEnvVars = envVars.filter(envVar => envVar.key.trim() !== '').map(envVar => ({
      ...envVar,
      is_preview: isPreview
    }));

    const envVarsMap = validEnvVars.reduce((acc, { key, value }) => {
      if (key) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    try {
      const branch = null;
      const response = await fetch(`/api/apps/${app.id}/env-vars`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch,
          isPreview,
          envVars: envVarsMap,
        }),
      });
      
      const result = await response.json();

      if (result.success) {
        // Update the local state with the new env vars
        setEnvVars(validEnvVars);
        setUnsavedChanges(false);
        showToast(`Environment variables updated successfully for ${isPreview ? 'preview' : 'production'} environment`, 'success');
      } else {
        showToast(result.error || 'Failed to update environment variables', 'error');
      }
    } catch (error) {
      console.error('Error updating environment variables:', error);
      showToast('An error occurred while updating environment variables', 'error');
    }
  };

  const handleImported = async () => {
    await Promise.all([mutateProduction(), mutatePreview()]);
  };

  const fetchExport = async (host: ExportPostgresHost) => {
    setExportLoading(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/env-vars/export?host=${host}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to export environment variables');
      }

      setExportText(result.env);
      setExportVisible(true);
    } catch (error) {
      console.error('Error exporting environment variables:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to export environment variables',
        'error'
      );
    } finally {
      setExportLoading(false);
    }
  };

  const handleChangeHost = (host: ExportPostgresHost) => {
    setExportHost(host);
    if (exportVisible) {
      void fetchExport(host);
    }
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      showToast('Copied environment variables to clipboard', 'success');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  if (error) {
    return <div className="text-red-500">Failed to load environment variables</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
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
        <Button type="button" color="blue" onClick={() => setImportModalOpen(true)}>
          <i className="fas fa-file-import mr-2" />
          Import from .env
        </Button>
      </div>

      <ImportEnvVarsModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        appId={app.id}
        branch={null}
        isPreview={isPreview}
        existingEnvVars={envVars}
        onImported={handleImported}
      />

      {isLoading ? (
        <div className="text-gray-500">Loading environment variables...</div>
      ) : (
        <EnvVarsForm
          envVars={envVars}
          isPreview={isPreview}
          unsavedChanges={unsavedChanges}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
      )}

      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            System Environment Variables
          </h3>
          <p className="text-sm text-gray-600">
            The full set of variables injected into the deployed{' '}
            <span className="font-medium">production</span> container, including
            platform-managed secrets (Postgres, MinIO, etc.). Useful for local
            development against platform services.
          </p>
        </div>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-gray-700">Export for</legend>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            {(
              [
                { value: 'postgres', label: 'Deployed', hint: 'postgres' },
                { value: 'localhost', label: 'localhost', hint: 'localhost' },
                {
                  value: 'host.docker.internal',
                  label: 'WSL / Docker',
                  hint: 'host.docker.internal',
                },
              ] as { value: ExportPostgresHost; label: string; hint: string }[]
            ).map((option) => (
              <label key={option.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="export-host"
                  value={option.value}
                  checked={exportHost === option.value}
                  onChange={() => handleChangeHost(option.value)}
                  className="border-gray-300"
                />
                <span>
                  {option.label}{' '}
                  <code className="text-xs text-gray-500">({option.hint})</code>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button
          type="button"
          color="gray"
          onClick={() => fetchExport(exportHost)}
          disabled={exportLoading}
        >
          <i className="fas fa-file-export mr-2" />
          {exportLoading ? 'Loading…' : exportVisible ? 'Refresh' : 'Show variables'}
        </Button>

        {exportVisible && (
          <div className="space-y-2">
            <textarea
              readOnly
              value={exportText}
              onFocus={(e) => e.target.select()}
              className="w-full h-64 font-mono text-xs border border-gray-300 rounded-md p-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-amber-700">
                <i className="fas fa-triangle-exclamation mr-1" />
                Contains plaintext secrets. Handle with care.
              </p>
              <div className="flex gap-3">
                <Button type="button" color="gray" onClick={() => setExportVisible(false)}>
                  <i className="fas fa-xmark mr-2" />
                  Hide
                </Button>
                <Button type="button" color="blue" onClick={handleCopyExport}>
                  <i className="fas fa-copy mr-2" />
                  Copy to clipboard
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
