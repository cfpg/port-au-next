'use client';

import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Label from '~/components/general/Label';
import { AppEnvVar } from '~/queries/fetchAppEnvVars';

interface EnvVarsFormProps {
  envVars: AppEnvVar[];
  isPreview: boolean;
  unsavedChanges: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: 'key' | 'value', value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function EnvVarsForm({ 
  envVars, 
  isPreview, 
  unsavedChanges,
  onAdd, 
  onRemove, 
  onChange, 
  onSubmit 
}: EnvVarsFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          Managing environment variables for {isPreview ? 'preview' : 'production'} environment.
        </p>
      </div>

      {envVars.map((envVar, index) => (
        <div key={index} className="flex gap-4 items-end">
          <div className="flex-1">
            <Label htmlFor={`key-${index}`}>Key</Label>
            <Input
              id={`key-${index}`}
              value={envVar.key}
              onChange={(e) => onChange(index, 'key', e.target.value)}
              placeholder="KEY"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor={`value-${index}`}>Value</Label>
            <Input
              id={`value-${index}`}
              value={envVar.value}
              onChange={(e) => onChange(index, 'value', e.target.value)}
              placeholder="value"
              showToggle
            />
          </div>
          <Button
            type="button"
            color="red"
            onClick={() => onRemove(index)}
            className="mb-2"
          >
            <i className="fas fa-trash mr-2"></i>
            Remove
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <Button type="button" color="blue" onClick={onAdd}>
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