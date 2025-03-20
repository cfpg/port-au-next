'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Label from '~/components/general/Label';
import { updateEnvVars } from '~/app/app/[appName]/actions';
import { useToast } from '~/components/general/ToastContainer';

interface EnvVarsFormProps {
  appId: number;
  branch: string;
  initialEnvVars: Record<string, string>;
}

export function EnvVarsForm({ appId, branch, initialEnvVars }: EnvVarsFormProps) {
  const { showToast } = useToast();
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    Object.entries(initialEnvVars).map(([key, value]) => ({ key, value }))
  );

  const handleAdd = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleRemove = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index] = { ...newEnvVars[index], [field]: value };
    setEnvVars(newEnvVars);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const envVarsMap = envVars.reduce((acc, { key, value }) => {
      if (key) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const result = await updateEnvVars(appId, branch, envVarsMap);
    
    if (result.success) {
      showToast('Environment variables updated successfully');
    } else {
      showToast(result.error || 'Failed to update environment variables');
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
            Remove
          </Button>
        </div>
      ))}
      
      <div className="flex gap-4">
        <Button type="button" color="blue" onClick={handleAdd}>
          Add Variable
        </Button>
        <Button type="submit" color="green">Save Changes</Button>
      </div>
    </form>
  );
} 