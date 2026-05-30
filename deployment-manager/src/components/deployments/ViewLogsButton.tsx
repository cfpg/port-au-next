'use client';

import { useState } from 'react';

import Button from '~/components/general/Button';
import Modal from '~/components/general/Modal';
import DeploymentLogViewerContainer from '~/components/deployments/DeploymentLogViewerContainer';

interface ViewLogsButtonProps {
  deploymentId: number;
  appName: string;
}

export default function ViewLogsButton({ deploymentId, appName }: ViewLogsButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="text-left">
      <Button color="gray-light" size="sm" onClick={() => setIsModalOpen(true)}>
        <i className="fas fa-eye mr-2"></i>
        View Logs
      </Button>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Deployment Logs - ${appName}`}
        size="logs"
      >
        <DeploymentLogViewerContainer
          appName={appName}
          deploymentId={deploymentId}
          enabled={isModalOpen}
        />
      </Modal>
    </div>
  );
}
