'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Label from '~/components/general/Label';
import { fetchZoneId, updateAppSettings } from '~/app/app/[appName]/actions';
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
      <div className="space-y-2">
        <Label htmlFor="name">App Name</Label>
        <Input
          id="name"
          value={settings.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="myapp"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="domain">Domain</Label>
        <Input
          id="domain"
          value={settings.domain || ''}
          onChange={(e) => handleChange('domain', e.target.value)}
          placeholder="example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="repository">Repository</Label>
        <Input
          id="repository"
          value={settings.repo_url || ''}
          onChange={(e) => handleChange('repo_url', e.target.value)}
          placeholder="https://github.com/myapp/myapp"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="branch">Branch</Label>
        <Input
          id="branch"
          value={settings.branch || ''}
          onChange={(e) => handleChange('branch', e.target.value)}
          placeholder="main"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cloudflare_zone_id">Cloudflare Zone ID</Label>
        <div className="flex items-center flex-row">
          <Input
            id="cloudflare_zone_id"
            value={settings.cloudflare_zone_id || ''}
            onChange={(e) => handleChange('cloudflare_zone_id', e.target.value)}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <Button
            onClick={() => {
              fetchZoneId(settings.name || '')
                .then((zoneId) => handleChange('cloudflare_zone_id', typeof zoneId === 'string' ? zoneId : ''));
            }}
            className="ml-4"
            color='gray'>
            Fetch Zone ID
          </Button>
        </div>
      </div>

      <Button type="submit">Save Changes</Button>
    </form>
  );
} 