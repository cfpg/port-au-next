"use client";

import { useState } from "react";
import Button from "../general/Button";
import { triggerDeployment } from "~/app/(dashboard)/actions";
import { useToast } from "~/components/general/ToastContainer";
import { usePathname } from "next/navigation";
import DeployPreviewBranchModal from "../deployments/DeployPreviewBranchModal";

interface AppDeployButtonProps {
  appName: string;
  branch?: string;
  showDropdown?: boolean;
}

export default function AppDeployButton({ appName, branch, showDropdown = false }: AppDeployButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showToast } = useToast();
  const pathname = usePathname();

  const handleDeploy = async (targetBranch?: string) => {
    try {
      setIsLoading(true);
      const result = await triggerDeployment(appName, { pathname, branch: targetBranch });
      if (!result.success) throw new Error(result.error);
      showToast(`Deployment started successfully for ${appName}`, 'success');
    } catch (error) {
      console.error(`Deployment failed for ${appName}:`, error);
      showToast(`Failed to start deployment for ${appName}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const dropdownItems = showDropdown ? [
    {
      label: "Deploy Branch",
      onClick: () => setIsModalOpen(true)
    }
  ] : undefined;

  return (
    <>
      <Button
        disabled={isLoading}
        size="sm"
        onClick={() => handleDeploy(branch)}
        dropdown={dropdownItems}
      >
        <i className="fas fa-rocket mr-2" />
        Deploy
      </Button>
      <DeployPreviewBranchModal
        appName={appName}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}