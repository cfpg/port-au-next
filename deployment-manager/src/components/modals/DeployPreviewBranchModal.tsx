"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import Modal from '~/components/general/Modal';
import Button from '~/components/general/Button';
import Callout from '~/components/general/Callout';
import BranchCombobox from '~/components/github/BranchCombobox';
import { triggerDeployment } from '~/app/(dashboard)/actions';
import { showToast } from "~/components/general/Toaster";
import ConfirmDialog from '~/components/general/ConfirmDialog';

interface DeployPreviewBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  appName: string;
  appId: number;
  previewDomain?: string;
}

interface FormError {
  message: string;
  field?: string;
}

export default function DeployPreviewBranchModal({
  isOpen,
  onClose,
  appName,
  appId,
  previewDomain
}: DeployPreviewBranchModalProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [branch, setBranch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [branchToConfirm, setBranchToConfirm] = useState<string | null>(null);

  const handleDeploy = async (confirmConcurrent = false) => {
    setError(null);

    if (!branch.trim()) {
      setError({
        message: "Please enter a branch name",
        field: "branch"
      });
      return;
    }

    try {
      setIsLoading(true);

      const targetBranch = branch.trim();
      const result = await triggerDeployment(appName, {
        branch: targetBranch,
        confirmConcurrent,
      });

      if (result?.requiresConfirmation) {
        setBranchToConfirm(targetBranch);
        return;
      }

      if (!result?.success) {
        const errorMessage = result?.error || "Failed to start deployment";
        if (errorMessage.toLowerCase().includes("branch") && errorMessage.toLowerCase().includes("not found")) {
          setError({
            message: "Branch not found. Please check the branch name and try again.",
            field: "branch"
          });
        } else {
          setError({
            message: errorMessage
          });
        }
        return;
      }

      showToast('Deployment queued.', 'success');
      setBranchToConfirm(null);
      mutate(`/api/apps/${appId}/deployments`);
      mutate('/api/apps');
      mutate('/api/apps/deployments');
      router.refresh();
      onClose();
    } catch (error) {
      console.error(`Deployment failed for branch ${branch}:`, error);
      setError({
        message: "An unexpected error occurred. Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setBranchToConfirm(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Deploy Preview Branch"
      size="sm"
    >
      <form onSubmit={(e) => { e.preventDefault(); handleDeploy(); }} className="flex flex-col gap-14">
        <BranchCombobox
          appId={appId}
          id="branch"
          label="Branch"
          placeholder="feature/checkout-v2"
          value={branch}
          onChange={(value) => {
            setBranch(value);
            if (error?.field === "branch") {
              setError(null);
            }
          }}
          error={error?.field === "branch" ? error.message : undefined}
          hint={
            !error && previewDomain
              ? `A preview deployment will be created at ${branch ? `${branch}.${previewDomain}` : `[branch].${previewDomain}`}`
              : undefined
          }
        />

        {error && !error.field ? <Callout tone="danger">{error.message}</Callout> : null}

        <div className="flex justify-end gap-7">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={!branch || isLoading}>
            Deploy branch
          </Button>
        </div>
      </form>
      <ConfirmDialog
        isOpen={branchToConfirm !== null}
        onClose={() => setBranchToConfirm(null)}
        onConfirm={() => handleDeploy(true)}
        isLoading={isLoading}
        title="Queue another deployment?"
        confirmLabel="Queue another"
        confirmVariant="primary"
        description="This branch already has a queued or running deployment. Queue another?"
      />
    </Modal>
  );
}
