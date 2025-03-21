import { useState } from 'react';

interface AppSettings {
  name: string;
  repository: string;
  branch: string;
  domain?: string;
  db_name?: string;
  db_user?: string;
  db_password?: string;
  cloudflare_zone_id?: string;
  env: Record<string, string>;
}

interface SettingsModalProps {
  appName: string;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

export default function SettingsModal({
  appName,
  settings,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [formData, setFormData] = useState<AppSettings>(settings);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="app-name" className="block text-sm font-medium text-gray-700 mb-2">
          App Name:
        </label>
        <input
          type="text"
          id="app-name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="repository" className="block text-sm font-medium text-gray-700 mb-2">
          Repository URL:
        </label>
        <input
          type="text"
          id="repository"
          value={formData.repository}
          onChange={(e) => setFormData({ ...formData, repository: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-2">
          Branch:
        </label>
        <input
          type="text"
          id="branch"
          value={formData.branch}
          onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-2">
          Domain:
        </label>
        <input
          type="text"
          id="domain"
          value={formData.domain || ''}
          onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="db-name" className="block text-sm font-medium text-gray-700 mb-2">
          Database Name:
        </label>
        <input
          type="text"
          id="db-name"
          value={formData.db_name || ''}
          onChange={(e) => setFormData({ ...formData, db_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="db-user" className="block text-sm font-medium text-gray-700 mb-2">
          Database User:
        </label>
        <input
          type="text"
          id="db-user"
          value={formData.db_user || ''}
          onChange={(e) => setFormData({ ...formData, db_user: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="db-password" className="block text-sm font-medium text-gray-700 mb-2">
          Database Password:
        </label>
        <input
          type="password"
          id="db-password"
          value={formData.db_password || ''}
          onChange={(e) => setFormData({ ...formData, db_password: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="cloudflare-zone" className="block text-sm font-medium text-gray-700 mb-2">
          Cloudflare Zone ID:
        </label>
        <input
          type="text"
          id="cloudflare-zone"
          value={formData.cloudflare_zone_id || ''}
          onChange={(e) => setFormData({ ...formData, cloudflare_zone_id: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t">
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
        >
          Save Changes
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
