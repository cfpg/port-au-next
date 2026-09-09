'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import FormSection from '~/components/general/FormSection';
import { updateAppSettings } from '~/app/(dashboard)/apps/[appName]/actions';
import { showToast } from '~/components/general/Toaster';

interface AppSettingsFormProps {
  appId: number;
  className?: string;
  initialSettings: {
    name?: string;
    domain?: string;
    repo_url?: string;
    branch?: string;
    cloudflare_zone_id?: string;
    root_path?: string;
  };
}

export function AppSettingsForm({ appId, className, initialSettings }: AppSettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = Object.keys(initialSettings).some(
    (key) => settings[key as keyof typeof settings] !== initialSettings[key as keyof typeof initialSettings]
  );

  const handleChange = (field: keyof typeof settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await updateAppSettings(appId, settings);
      if (result?.success) {
        showToast('App settings updated successfully.', 'success');
      } else {
        showToast(result?.error || 'Failed to update app settings', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSection
      title="App Settings"
      className={className}
      onSubmit={handleSubmit}
      footer={
        <Button type="submit" variant="primary" loading={isSaving} disabled={!isDirty || isSaving}>
          Save changes
        </Button>
      }
    >
      <Input
        id="name"
        label="App Name"
        value={settings.name || ''}
        onChange={(e) => handleChange('name', e.target.value)}
        placeholder="myapp"
      />

      <Input
        id="domain"
        label="Domain"
        value={settings.domain || ''}
        onChange={(e) => handleChange('domain', e.target.value)}
        placeholder="srv1.example.com"
        hint="Saving a domain creates a Cloudflare tunnel route and proxied CNAME when Cloudflare is connected in Settings."
      />

      <Input
        id="repository"
        label="Repository"
        value={settings.repo_url || ''}
        onChange={(e) => handleChange('repo_url', e.target.value)}
        placeholder="https://github.com/myapp/myapp"
      />

      <Input
        id="branch"
        label="Branch"
        value={settings.branch || ''}
        onChange={(e) => handleChange('branch', e.target.value)}
        placeholder="main"
      />

      <Input
        id="root_path"
        label="Project path"
        className="col-span-full"
        value={settings.root_path || ''}
        onChange={(e) => handleChange('root_path', e.target.value)}
        placeholder="marketing-site"
        hint="For monorepos, the subdirectory containing your Next.js app (must include package.json and next.config.ts). Leave empty to use the repository root."
      />

      {settings.cloudflare_zone_id && (
        <Input
          label="Cloudflare zone ID"
          className="col-span-full"
          value={settings.cloudflare_zone_id}
          disabled
          hint="Set automatically when the tunnel route is created."
        />
      )}
    </FormSection>
  );
}
