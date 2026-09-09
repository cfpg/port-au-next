"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '~/components/general/Modal';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Callout from '~/components/general/Callout';
import { triggerDeployment } from '~/app/(dashboard)/actions';
import { showToast } from "~/components/general/Toaster";

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
  previewDomain
}: DeployPreviewBranchModalProps) {
  const router = useRouter();
  const [branch, setBranch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const handleDeploy = async () => {
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

      const result = await triggerDeployment(appName, { branch: branch.trim() });

      if (!result.success) {
        const errorMessage = result.error || "Failed to start deployment";
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

      showToast(`Deployment started successfully for branch ${branch}`, "success");
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
        <Input
          id="branch"
          type="text"
          label="Branch"
          placeholder="feature/checkout-v2"
          value={branch}
          onChange={(e) => {
            setBranch(e.target.value);
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
          required
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
    </Modal>
  );
}
