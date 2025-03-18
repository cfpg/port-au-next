import { useState } from 'react';

interface EnvVar {
  key: string;
  value: string;
}

interface EnvironmentVariablesModalProps {
  appName: string;
  initialVars: EnvVar[];
  branch: string;
  onSave: (branch: string, vars: EnvVar[]) => void;
  onClose: () => void;
}

export default function EnvironmentVariablesModal({
  appName,
  initialVars,
  branch,
  onSave,
  onClose,
}: EnvironmentVariablesModalProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>(initialVars);
  const [currentBranch, setCurrentBranch] = useState(branch);

  const addNewEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const newVars = [...envVars];
    newVars[index] = { ...newVars[index], [field]: value };
    setEnvVars(newVars);
  };

  const deleteEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const validVars = envVars.filter(env => env.key && env.value);
    onSave(currentBranch, validVars);
  };

  return (
    <div>
      <div className="mb-4">
        <label htmlFor="branch-select" className="block text-sm font-medium text-gray-700 mb-2">
          Branch:
        </label>
        <input
          type="text"
          id="branch-select"
          value={currentBranch}
          onChange={(e) => setCurrentBranch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {envVars.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No environment variables set. Click "Add New Variable" to create one.
          </div>
        ) : (
          envVars.map((env, index) => (
            <div key={index} className="env-var-row flex items-center space-x-2">
              <input
                type="text"
                value={env.key}
                onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                placeholder="KEY"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
              <input
                type="text"
                value={env.value}
                onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                placeholder="VALUE"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                onClick={() => deleteEnvVar(index)}
                className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      <button
        onClick={addNewEnvVar}
        className="mb-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
      >
        Add New Variable
      </button>

      <div className="flex justify-end space-x-3 pt-4 border-t">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
        >
          Save Changes
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}