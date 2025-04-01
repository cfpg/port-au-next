'use client';

import { useState } from "react";
import Button from "~/components/general/Button";
import Modal from "~/components/general/Modal";
import { DeploymentLog, AppDeployment } from "~/types";
import useSWR from "swr";
import fetcher from "~/utils/fetcher";
import DeploymentLogsModal from "~/components/modals/DeploymentLogsModal";

interface ViewLogsButtonProps {
  deploymentId: number;
  appName: string;
}

export default function ViewLogsButton({ deploymentId, appName }: ViewLogsButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, error, isLoading } = useSWR<{ app: AppDeployment; logs: DeploymentLog[] }>(
    isModalOpen ? `/deployments?appName=${appName}&deploymentId=${deploymentId}` : null,
    fetcher
  );

  return (
    <div className="text-left">
      <Button
        color="gray-light"
        size="sm"
        onClick={() => setIsModalOpen(true)}
      >
        <i className="fas fa-eye mr-2"></i>
        View Logs
      </Button>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Deployment Logs - ${appName}`}
        size="5xl"
      >
        <div className="space-y-4">
          {error ? (
            <div className="text-center py-4">
              <span className="text-red-500">Error loading logs. Please try again.</span>
            </div>
          ) : isLoading ? (
            <div className="text-center py-4">
              <span className="text-gray-500">Loading logs...</span>
            </div>
          ) : data ? (
            <DeploymentLogsModal app={data.app} logs={data.logs} />
          ) : (
            <div className="text-center py-4">
              <span className="text-gray-500">No data found</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
} 