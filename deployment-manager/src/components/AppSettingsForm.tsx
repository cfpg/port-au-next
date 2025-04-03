'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Label from '~/components/general/Label';
import { fetchZoneId, updateAppSettings } from '~/app/(dashboard)/apps/[appName]/actions';
import { useToast } from '~/components/general/ToastContainer';

interface AppSettingsFormProps {
  appId: number;
  initialSettings: {
    name?: string;
    domain?: string;
    repo_url?: string;
    branch?: string;
    cloudflare_zone_id?: string;
  };
}

export function AppSettingsForm({ appId, initialSettings }: AppSettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const { showToast } = useToast();

  const handleChange = (field: keyof typeof settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await updateAppSettings(appId, settings);

    if (result.success) {
      showToast("App settings updated successfully.");
    } else {
      showToast(result.error || 'Failed to update app settings');
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
          placeholder="example.com"
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          id="cloudflare_zone_id"
          label="Cloudflare Zone ID"
          value={settings.cloudflare_zone_id || ''}
          onChange={(e) => handleChange('cloudflare_zone_id', e.target.value)}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          showToggle={true}
        />
        <div className="flex items-end">
          <Button
            onClick={() => {
              fetchZoneId(settings.name || '')
                .then((zoneId) => handleChange('cloudflare_zone_id', typeof zoneId === 'string' ? zoneId : ''));
            }}
            color='gray'>
            <i className="fas fa-sync mr-2"></i>
            Fetch Zone ID
          </Button>
        </div>
      </div>

      <Button type="submit" color='green'>
        <i className="fas fa-save mr-2"></i>
        Save Changes
      </Button>
    </form>
  );
} 