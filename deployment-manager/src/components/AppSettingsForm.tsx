'use client';

import { useState } from 'react';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Label from '~/components/general/Label';
import { updateAppSettings } from '~/app/app/[appName]/actions';
import { useToast } from '~/components/general/ToastContainer';

interface AppSettingsFormProps {
  appId: number;
  initialSettings: {
    domain?: string;
    db_name?: string;
    db_user?: string;
    db_password?: string;
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
        <Label htmlFor="domain">Domain</Label>
        <Input
          id="domain"
          value={settings.domain || ''}
          onChange={(e) => handleChange('domain', e.target.value)}
          placeholder="example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="db_name">Database Name</Label>
        <Input
          id="db_name"
          value={settings.db_name || ''}
          onChange={(e) => handleChange('db_name', e.target.value)}
          placeholder="myapp_db"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="db_user">Database User</Label>
        <Input
          id="db_user"
          value={settings.db_user || ''}
          onChange={(e) => handleChange('db_user', e.target.value)}
          placeholder="myapp_user"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="db_password">Database Password</Label>
        <Input
          id="db_password"
          type="password"
          value={settings.db_password || ''}
          onChange={(e) => handleChange('db_password', e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cloudflare_zone_id">Cloudflare Zone ID</Label>
        <Input
          id="cloudflare_zone_id"
          value={settings.cloudflare_zone_id || ''}
          onChange={(e) => handleChange('cloudflare_zone_id', e.target.value)}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        />
      </div>

      <Button type="submit">Save Changes</Button>
    </form>
  );
} 