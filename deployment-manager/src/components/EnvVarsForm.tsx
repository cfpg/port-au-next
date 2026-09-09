'use client';

import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { PlusIcon } from '~/components/general/icons';
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
    <form onSubmit={onSubmit} className="flex flex-col gap-14">
      <p className="text-field text-ink-muted">
        Managing environment variables for {isPreview ? 'preview' : 'production'} environment.
      </p>

      {envVars.map((envVar, index) => (
        <div key={index} className="flex gap-10 items-end">
          <Input
            label="Key"
            id={`key-${index}`}
            value={envVar.key}
            onChange={(e) => onChange(index, 'key', e.target.value)}
            placeholder="KEY"
            className="flex-1"
          />
          <Input
            label="Value"
            id={`value-${index}`}
            value={envVar.value}
            onChange={(e) => onChange(index, 'value', e.target.value)}
            placeholder="value"
            showToggle
            className="flex-1"
          />
          <Button type="button" variant="danger" onClick={() => onRemove(index)}>
            <i className="fas fa-trash" />
            Remove
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-14">
        <Button type="button" variant="secondary" onClick={onAdd}>
          <PlusIcon />
          Add Variable
        </Button>
        <Button type="submit" variant="primary" disabled={!unsavedChanges}>
          <i className="fas fa-save" />
          Save changes
        </Button>
        {unsavedChanges && (
          <span className="text-mini text-ink-faint">Unsaved changes, lost if you leave this page.</span>
        )}
      </div>
    </form>
  );
}
