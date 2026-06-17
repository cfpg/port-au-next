'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { updateAppSettings } from '~/app/(dashboard)/apps/[appName]/actions';
import { showToast } from '~/components/general/Toaster';

interface AppSettingsFormProps {
  appId: number;
  initialSettings: {
    name?: string;
    domain?: string;
    repo_url?: string;
    branch?: string;
    cloudflare_zone_id?: string;
    root_path?: string;
  };
}

export function AppSettingsForm({ appId, initialSettings }: AppSettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);

  const handleChange = (field: keyof typeof settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await updateAppSettings(appId, settings);

    if (result?.success) {
      showToast("App settings updated successfully.", "success");
    } else {
      showToast(result?.error || 'Failed to update app settings', "error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        />
        <p className="md:col-span-2 -mt-2 text-sm text-gray-500">
          Saving a domain creates a Cloudflare tunnel published application and proxied CNAME when
          Cloudflare is connected in Settings.
        </p>

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

        <div className="md:col-span-2">
          <Input
            id="root_path"
            label="Project path"
            value={settings.root_path || ''}
            onChange={(e) => handleChange('root_path', e.target.value)}
            placeholder="marketing-site"
          />
          <p className="mt-1 text-sm text-gray-500">
            For monorepos, set the subdirectory containing your Next.js app (must include
            package.json and next.config.ts). Leave empty to use the repository root.
          </p>
        </div>
      </div>

      {settings.cloudflare_zone_id && (
        <p className="text-sm text-gray-500">
          Cloudflare zone ID: <span className="font-mono">{settings.cloudflare_zone_id}</span>
          {' '}(set automatically when the tunnel route is created)
        </p>
      )}

      <Button type="submit" color='green'>
        <i className="fas fa-save mr-2"></i>
        Save Changes
      </Button>
    </form>
  );
} 