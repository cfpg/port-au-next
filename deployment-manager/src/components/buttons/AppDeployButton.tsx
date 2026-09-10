"use client";

import { useState } from "react";
import Button from "~/components/general/Button";
import { triggerDeployment } from "~/app/(dashboard)/actions";
import { showToast } from "~/components/general/Toaster";
import { usePathname } from "next/navigation";
import DeployPreviewBranchModal from "~/components/modals/DeployPreviewBranchModal";
import { App } from "~/types";
import { useSWRConfig } from "swr";
import ConfirmDialog from "~/components/general/ConfirmDialog";

interface AppDeployButtonProps {
  app: App;
  branch?: string;
  showDropdown?: boolean;
  /** Which edge the split-button's dropdown aligns to. Flip to "right" near a container's right edge (e.g. a table's last column). */
  dropdownAlign?: 'left' | 'right';
}

export default function AppDeployButton({ app, branch, showDropdown = false, dropdownAlign = 'left' }: AppDeployButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [branchToConfirm, setBranchToConfirm] = useState<string | null>(null);
  const pathname = usePathname();
  const { mutate } = useSWRConfig();

  const handleDeploy = async (targetBranch?: string, confirmConcurrent = false) => {
    const resolvedBranch = targetBranch || app.branch;
    try {
      setIsLoading(true);
      const result = await triggerDeployment(app.name, {
        pathname,
        branch: resolvedBranch,
        confirmConcurrent,
      });
      if (result?.requiresConfirmation) {
        setBranchToConfirm(resolvedBranch);
        return;
      }
      if (result?.error) throw new Error(result.error);
      setBranchToConfirm(null);
      showToast(`Deployment started successfully for ${app.name}`, 'success');
    } catch (error) {
      console.error(`Deployment failed for ${app.name}:`, error);
      showToast(`Failed to start deployment for ${app.name}`, 'error');
    } finally {
      setIsLoading(false);
      mutate(`/api/apps/${app.id}`);
      mutate(`/api/apps/${app.id}/deployments`);
      mutate(`/api/apps/${app.id}/preview-branches`);
    };
  }

  const dropdownItems = showDropdown ? [
    {
      label: "Deploy Branch",
      onClick: () => setIsModalOpen(true)
    }
  ] : undefined;

  return (
    <>
      <Button
        variant="primary"
        disabled={isLoading}
        loading={isLoading}
        size="sm"
        onClick={() => handleDeploy(branch)}
        dropdown={dropdownItems}
        dropdownAlign={dropdownAlign}
      >
        <i className="fas fa-rocket" />
        Deploy
      </Button>
      <DeployPreviewBranchModal
        appName={app.name}
        appId={app.id}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <ConfirmDialog
        isOpen={branchToConfirm !== null}
        onClose={() => setBranchToConfirm(null)}
        onConfirm={() => branchToConfirm ? handleDeploy(branchToConfirm, true) : undefined}
        isLoading={isLoading}
        title="Deploy branch again?"
        confirmLabel="Deploy again"
        confirmVariant="primary"
        description="That branch is currently deploying and building. Are you sure you want to deploy it again?"
      />
    </>
  );
}
