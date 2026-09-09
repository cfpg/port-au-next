'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { EnvVarsForm } from '~/components/EnvVarsForm';
import ImportEnvVarsModal from '~/components/env-vars/ImportEnvVarsModal';
import Select from '~/components/general/Select';
import Button from '~/components/general/Button';
import Callout from '~/components/general/Callout';
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
    return <Callout tone="danger">Failed to load environment variables.</Callout>;
  }

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-wrap items-end gap-10">
        <Select
          id="env-type"
          label="Environment Type"
          value={isPreview ? 'Preview' : 'Production'}
          onChange={(e) => setIsPreview(e.target.value === 'Preview')}
          options={[
            { value: 'Production', label: 'Production' },
            { value: 'Preview', label: 'Preview' },
          ]}
          className="w-190"
        />
        <Button type="button" variant="secondary" onClick={() => setImportModalOpen(true)}>
          <i className="fas fa-file-import" />
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
        <div className="text-panel text-ink-faint">Loading environment variables...</div>
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

      <div className="border border-line rounded-menu bg-paper p-14 flex flex-col gap-11">
        <div>
          <div className="font-display font-semibold text-panel">System Environment Variables</div>
          <p className="text-field text-ink-muted mt-3">
            The full set of variables injected into the deployed <strong className="font-semibold text-ink">production</strong> container, including
            platform-managed secrets (Postgres, MinIO, etc.). Useful for local
            development against platform services.
          </p>
        </div>

        <fieldset className="flex flex-col gap-7">
          <legend className="font-display font-semibold text-label text-ink mb-2">Export for</legend>
          <div className="flex flex-wrap gap-14 text-field text-ink">
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
              <label key={option.value} className="flex items-center gap-6 cursor-pointer">
                <input
                  type="radio"
                  name="export-host"
                  value={option.value}
                  checked={exportHost === option.value}
                  onChange={() => handleChangeHost(option.value)}
                  className="accent-primary"
                />
                <span>
                  {option.label}{' '}
                  <span className="font-mono text-micro text-ink-faint">({option.hint})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button
          type="button"
          variant="secondary"
          onClick={() => fetchExport(exportHost)}
          loading={exportLoading}
          className="self-start"
        >
          <i className="fas fa-file-export" />
          {exportVisible ? 'Refresh' : 'Show variables'}
        </Button>

        {exportVisible && (
          <div className="flex flex-col gap-9">
            <textarea
              readOnly
              value={exportText}
              onFocus={(e) => e.target.select()}
              className="w-full h-190 font-mono text-meta border border-line-strong rounded-control p-11 bg-surface focus:outline-none focus:border-primary focus:shadow-focus"
            />
            <div className="flex items-center justify-between gap-10 flex-wrap">
              <p className="text-mini text-warning-ink flex items-center gap-5">
                <i className="fas fa-triangle-exclamation" />
                Contains plaintext secrets. Handle with care.
              </p>
              <div className="flex gap-7">
                <Button type="button" variant="secondary" size="sm" onClick={() => setExportVisible(false)}>
                  <i className="fas fa-xmark" />
                  Hide
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={handleCopyExport}>
                  <i className="fas fa-copy" />
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
