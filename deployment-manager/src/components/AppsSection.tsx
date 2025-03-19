'use client';

import { useState } from 'react';
import AppTable from './AppTable';
import { useToast } from './general/ToastContainer';
import Modal from './general/Modal';
import DeploymentModal from './DeploymentModal';
import EnvironmentVariablesModal from './EnvironmentVariablesModal';
import SettingsModal from './SettingsModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import DeploymentHistoryTable from './DeploymentHistoryTable';
import { Deployment } from '~/types';

interface App {
  id: number;
  name: string;
  repository: string;
  branch: string;
  domain?: string;
  db_name?: string;
  db_user?: string;
  db_password?: string;
  cloudflare_zone_id?: string;
  env: Record<string, string>;
  status: string;
  last_deployment?: {
    version: string;
    commit_id: string;
    status: string;
    deployed_at: Date;
  };
}

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

interface AppsSectionProps {
  initialApps: App[];
  initialDeployments: Deployment[];
}

export default function AppsSection({ initialApps, initialDeployments }: AppsSectionProps) {
  const [apps, setApps] = useState<App[]>(initialApps);
  const [deployments, setDeployments] = useState<Deployment[]>(initialDeployments);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isDeploymentModalOpen, setIsDeploymentModalOpen] = useState(false);
  const [isEnvVarsModalOpen, setIsEnvVarsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { showToast } = useToast();

  const handleDeploy = async (appName: string) => {
    try {
      const response = await fetch(`/api/apps/${appName}/deploy`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Deployment failed');
      showToast('Deployment started successfully', 'success');
    } catch (error) {
      showToast('Failed to start deployment', 'error');
    }
  };

  const handleViewDeployments = async (appName: string) => {
    try {
      const response = await fetch(`/api/apps/${appName}/deployments`);
      if (!response.ok) throw new Error('Failed to fetch deployments');
      const data = await response.json();
      setDeployments(data);
      setSelectedApp(apps.find(app => app.name === appName) || null);
      setIsDeploymentModalOpen(true);
    } catch (error) {
      showToast('Failed to fetch deployments', 'error');
    }
  };

  const handleViewLogs = async (version: string) => {
    try {
      const response = await fetch(`/api/apps/${selectedApp?.name}/deployments/${version}/logs`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      showToast('Logs fetched successfully', 'success');
    } catch (error) {
      showToast('Failed to fetch logs', 'error');
    }
  };

  const handleEditEnvVars = async (appName: string) => {
    try {
      const response = await fetch(`/api/apps/${appName}/env`);
      if (!response.ok) throw new Error('Failed to fetch environment variables');
      const data = await response.json();
      setSelectedApp(apps.find(app => app.name === appName) || null);
      setIsEnvVarsModalOpen(true);
    } catch (error) {
      showToast('Failed to fetch environment variables', 'error');
    }
  };

  const handleSaveEnvVars = async (branch: string, vars: { key: string; value: string }[]) => {
    try {
      const response = await fetch(`/api/apps/${selectedApp?.name}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, vars }),
      });
      if (!response.ok) throw new Error('Failed to save environment variables');
      showToast('Environment variables saved successfully', 'success');
      setIsEnvVarsModalOpen(false);
    } catch (error) {
      showToast('Failed to save environment variables', 'error');
    }
  };

  const handleEditSettings = async (appName: string) => {
    try {
      const response = await fetch(`/api/apps/${appName}/settings`);
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSelectedApp(apps.find(app => app.name === appName) || null);
      setIsSettingsModalOpen(true);
    } catch (error) {
      showToast('Failed to fetch settings', 'error');
    }
  };

  const handleSaveSettings = async (settings: AppSettings) => {
    try {
      const response = await fetch(`/api/apps/${selectedApp?.name}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      showToast('Settings saved successfully', 'success');
      setIsSettingsModalOpen(false);

      // Update the local state
      setApps(apps.map(app =>
        app.id === selectedApp?.id
          ? { ...app, ...settings }
          : app
      ));
    } catch (error) {
      showToast('Failed to save settings', 'error');
    }
  };

  const handleDelete = async (appName: string) => {
    try {
      const response = await fetch(`/api/apps/${appName}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete app');
      showToast('App deleted successfully', 'success');
      setIsDeleteModalOpen(false);
    } catch (error) {
      showToast('Failed to delete app', 'error');
    }
  };

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-black">Applications</h2>
        <AppTable
          apps={apps}
          onDeploy={handleDeploy}
          onViewDeployments={handleViewDeployments}
          onEditEnvVars={handleEditEnvVars}
          onEditSettings={handleEditSettings}
          onDelete={(appName) => {
            setSelectedApp(apps.find(app => app.name === appName) || null);
            setIsDeleteModalOpen(true);
          }}
        />
      </section>

      <section className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-black">Deployment History</h2>
        <DeploymentHistoryTable
          deployments={deployments}
          onViewLogs={handleViewLogs}
        />
      </section>

      <Modal
        isOpen={isDeploymentModalOpen}
        onClose={() => setIsDeploymentModalOpen(false)}
        title={`Deployment History - ${selectedApp?.name}`}
      >
        <DeploymentModal
          appName={selectedApp?.name || ''}
          deployments={deployments}
          onViewLogs={handleViewLogs}
        />
      </Modal>

      <Modal
        isOpen={isEnvVarsModalOpen}
        onClose={() => setIsEnvVarsModalOpen(false)}
        title={`Environment Variables - ${selectedApp?.name}`}
      >
        <EnvironmentVariablesModal
          appName={selectedApp?.name || ''}
          initialVars={[]}
          branch={selectedApp?.branch || 'main'}
          onSave={handleSaveEnvVars}
          onClose={() => setIsEnvVarsModalOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title={`Settings - ${selectedApp?.name}`}
      >
        <SettingsModal
          appName={selectedApp?.name || ''}
          settings={selectedApp || {
            name: '',
            repository: '',
            branch: 'main',
            domain: '',
            db_name: '',
            db_user: '',
            db_password: '',
            cloudflare_zone_id: '',
            env: {},
          }}
          onSave={handleSaveSettings}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={`Delete App - ${selectedApp?.name}`}
      >
        <DeleteConfirmationModal
          appName={selectedApp?.name || ''}
          onConfirm={() => handleDelete(selectedApp?.name || '')}
          onCancel={() => setIsDeleteModalOpen(false)}
        />
      </Modal>
    </>
  );
} 