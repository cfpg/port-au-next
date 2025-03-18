'use client';

import { useState } from 'react';
import Toast from '~/components/Toast';
import Modal from '~/components/Modal';
import DeploymentModal from '~/components/DeploymentModal';
import EnvironmentVariablesModal from '~/components/EnvironmentVariablesModal';
import SettingsModal from '~/components/SettingsModal';
import DeleteConfirmationModal from '~/components/DeleteConfirmationModal';
import AppRegistrationForm from '~/components/AppRegistrationForm';
import AppTable from '~/components/AppTable';
import DeploymentHistoryTable from '~/components/DeploymentHistoryTable';

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface App {
  name: string;
  repository: string;
  branch: string;
  port: number;
  status: 'running' | 'stopped' | 'error';
  last_deployment?: string;
}

interface Deployment {
  version: string;
  commit_id: string;
  status: 'success' | 'failed' | 'in_progress';
  active_container: string;
  deployed_at: string;
}

export default function Home() {
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'info',
  });

  const [apps, setApps] = useState<App[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isDeploymentModalOpen, setIsDeploymentModalOpen] = useState(false);
  const [isEnvVarsModalOpen, setIsEnvVarsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const showToast = (message: string, type: ToastState['type'] = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 5000);
  };

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
      // TODO: Implement log viewing functionality
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

  const handleSaveSettings = async (settings: App) => {
    try {
      const response = await fetch(`/api/apps/${selectedApp?.name}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      showToast('Settings saved successfully', 'success');
      setIsSettingsModalOpen(false);
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

  const handleRegisterApp = async (data: Omit<App, 'status' | 'last_deployment'>) => {
    try {
      const response = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to register app');
      showToast('App registered successfully', 'success');
    } catch (error) {
      showToast('Failed to register app', 'error');
    }
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Port-au-Next Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <section className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Applications</h2>
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

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Deployments</h2>
            <DeploymentHistoryTable
              deployments={deployments}
              onViewLogs={handleViewLogs}
            />
          </section>
        </div>

        <div>
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Register New App</h2>
            <AppRegistrationForm onSubmit={handleRegisterApp} />
          </section>
        </div>
      </div>

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
            port: 3000,
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

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ show: false, message: '', type: 'info' })}
        />
      )}
    </main>
  );
}
