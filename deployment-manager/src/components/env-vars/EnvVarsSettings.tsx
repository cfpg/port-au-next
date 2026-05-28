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

interface EnvVarsSettingsProps {
  app: App;
}

export default function EnvVarsSettings({ app }: EnvVarsSettingsProps) {
  const [isPreview, setIsPreview] = useState(false);
  const [envVars, setEnvVars] = useState<AppEnvVar[]>([]);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

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
      branch: isPreview ? null : app.branch, 
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
      const branch = isPreview ? null : app.branch;
      const response = await fetch(`/api/apps/${app.id}/env-vars`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch,
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
        branch={isPreview ? null : app.branch}
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
    </div>
  );
} 