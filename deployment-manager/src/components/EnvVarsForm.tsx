'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Label from '~/components/general/Label';
import { updateAppEnvVars } from '~/app/(dashboard)/apps/[appName]/actions';
import { showToast } from '~/components/general/Toaster';
import { AppEnvVar } from '~/queries/fetchAppEnvVars';

interface EnvVarsFormProps {
  appId: number;
  branch: string;
  initialEnvVars: AppEnvVar[];
}

export function EnvVarsForm({ appId, branch, initialEnvVars }: EnvVarsFormProps) {
  const [envVars, setEnvVars] = useState<AppEnvVar[]>(initialEnvVars);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const calculateUnsavedChanges = () => {
    const unsaved = envVars.some((envVar, index) => {
      const initialVar = initialEnvVars[index];
      return !initialVar || envVar.key !== initialVar.key || envVar.value !== initialVar.value;
    });
    setUnsavedChanges(unsaved);
  };

  const handleAdd = () => {
    setEnvVars([...envVars, { key: '', value: '', branch: null, is_preview: branch === 'preview' }]);
    calculateUnsavedChanges();
  };

  const handleRemove = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
    calculateUnsavedChanges();
  };

  const handleChange = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index] = { ...newEnvVars[index], [field]: value };
    setEnvVars(newEnvVars);
    calculateUnsavedChanges();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const envVarsMap = envVars.reduce((acc, { key, value }) => {
      if (key) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const result = await updateAppEnvVars(appId, branch, envVarsMap);

    if (result.success) {
      showToast('Environment variables updated successfully', 'success');
      setUnsavedChanges(false);
    } else {
      showToast(result.error || 'Failed to update environment variables', 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <Button type="submit" color="green">
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