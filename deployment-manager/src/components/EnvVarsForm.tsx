'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Label from '~/components/general/Label';
import { updateAppEnvVars } from '~/app/(dashboard)/apps/[appName]/actions';
import { showToast } from '~/components/general/Toaster';
import { AppEnvVar } from '~/queries/fetchAppEnvVars';
import { App } from '~/types';

interface EnvVarsFormProps {
  app: App;
  isPreview: boolean;
  initialEnvVars: AppEnvVar[];
}

export function EnvVarsForm({ app, isPreview, initialEnvVars }: EnvVarsFormProps) {
  const [envVars, setEnvVars] = useState<AppEnvVar[]>(initialEnvVars);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  
  const branch = isPreview ? null : app.branch;

  const calculateUnsavedChanges = () => {
    const unsaved = envVars.some((envVar, index) => {
      const initialVar = initialEnvVars[index];
      return !initialVar || envVar.key !== initialVar.key || envVar.value !== initialVar.value;
    });
    setUnsavedChanges(unsaved);
  };

  const handleAdd = () => {
    setEnvVars([...envVars, { 
      key: '', 
      value: '', 
      branch, 
      is_preview: isPreview 
    }]);
    calculateUnsavedChanges();
  };

  const handleRemove = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
    calculateUnsavedChanges();
  };

  const handleChange = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index] = { 
      ...newEnvVars[index], 
      [field]: value,
      is_preview: isPreview // Ensure is_preview is always set correctly
    };
    setEnvVars(newEnvVars);
    calculateUnsavedChanges();
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
      const result = await updateAppEnvVars(app.id, branch, envVarsMap);

      if (result.success) {
        showToast(`Environment variables updated successfully for ${isPreview ? 'preview' : 'production'} environment`, 'success');
        setUnsavedChanges(false);
        // Update the local state with the new env vars to ensure consistency
        setEnvVars(validEnvVars);
      } else {
        showToast(result.error || 'Failed to update environment variables', 'error');
      }
    } catch (error) {
      showToast('An error occurred while updating environment variables', 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          Managing environment variables for {isPreview ? 'preview' : 'production'} environment
          {isPreview && <span className="ml-2">(Branch: {branch})</span>}
        </p>
      </div>

      {envVars.map((envVar, index) => (
        <div key={index} className="flex gap-4 items-end">
          <div className="flex-1">
            <Label htmlFor={`key-${index}`}>Key</Label>
            <Input
              id={`key-${index}`}
              value={envVar.key}
              onChange={(e) => handleChange(index, 'key', e.target.value)}
              placeholder="KEY"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor={`value-${index}`}>Value</Label>
            <Input
              id={`value-${index}`}
              value={envVar.value}
              onChange={(e) => handleChange(index, 'value', e.target.value)}
              placeholder="value"
              type="password"
              showToggle
            />
          </div>
          <Button
            type="button"
            color="red"
            onClick={() => handleRemove(index)}
            className="mb-2"
          >
            <i className="fas fa-trash mr-2"></i>
            Remove
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <Button type="button" color="blue" onClick={handleAdd}>
          <i className="fas fa-plus mr-2"></i>
          Add Variable
        </Button>
        <Button type="submit" color="green" disabled={!unsavedChanges}>
          <i className="fas fa-save mr-2"></i>
          Save Changes
        </Button>
        {unsavedChanges && (
          <p className="text-sm text-gray-500 italic">Unsaved Changes. Changes will be lost if you leave this page.</p>
        )}
      </div>
    </form>
  );
} 