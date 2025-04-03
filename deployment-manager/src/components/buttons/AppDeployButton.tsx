"use client";

import { useState } from "react";
import Button from "~/components/general/Button";
import { triggerDeployment } from "~/app/(dashboard)/actions";
import { useToast } from "~/components/general/ToastContainer";
import { usePathname } from "next/navigation";
import DeployPreviewBranchModal from "~/components/modals/DeployPreviewBranchModal";
import { App } from "~/types";

interface AppDeployButtonProps {
  app: App;
  branch?: string;
  showDropdown?: boolean;
}

export default function AppDeployButton({ app, branch, showDropdown = false }: AppDeployButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showToast } = useToast();
  const pathname = usePathname();

  const handleDeploy = async (targetBranch?: string) => {
    try {
      setIsLoading(true);
      const result = await triggerDeployment(app.name, { pathname, branch: targetBranch });
      if (!result.success) throw new Error(result.error);
      showToast(`Deployment started successfully for ${app.name}`, 'success');
    } catch (error) {
      console.error(`Deployment failed for ${app.name}:`, error);
      showToast(`Failed to start deployment for ${app.name}`, 'error');
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
        appName={app.name}
        appId={app.id}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}