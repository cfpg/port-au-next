import { useState } from 'react';

interface AppSettings {
  name: string;
  repository: string;
  branch: string;
  port: number;
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
        <label htmlFor="port" className="block text-sm font-medium text-gray-700 mb-2">
          Port:
        </label>
        <input
          type="number"
          id="port"
          value={formData.port}
          onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
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
