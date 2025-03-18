import { useState } from 'react';

interface AppRegistrationFormProps {
  onSubmit: (data: {
    name: string;
    repository: string;
    branch: string;
    port: number;
    env: Record<string, string>;
  }) => void;
}

export default function AppRegistrationForm({ onSubmit }: AppRegistrationFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    repository: '',
    branch: 'main',
    port: 3000,
    env: {},
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({
      name: '',
      repository: '',
      branch: 'main',
      port: 3000,
      env: {},
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          App Name:
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
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
          required
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
          required
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
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <button
        type="submit"
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
      >
        Register App
      </button>
    </form>
  );
}