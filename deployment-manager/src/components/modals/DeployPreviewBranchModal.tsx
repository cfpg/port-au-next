"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '~/components/general/Modal';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
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
  appId,
  previewDomain
}: DeployPreviewBranchModalProps) {
  const router = useRouter();
  const [branch, setBranch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const handleDeploy = async () => {
    // Reset error state
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
        // Check if it's a branch not found error
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

  // Reset error when modal closes
  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Deploy Preview Branch"
      size="lg"
    >
      <form onSubmit={(e) => { e.preventDefault(); handleDeploy(); }} className="space-y-4 text-left">
        <div>
          <Input
            id="branch"
            type="text"
            label="Branch Name"
            placeholder="Enter branch name (e.g. dev, feature/new-ui)"
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              // Clear error when user starts typing
              if (error?.field === "branch") {
                setError(null);
              }
            }}
            error={error?.field === "branch" ? error.message : undefined}
            required
          />
          {previewDomain && (
            <p className="mt-2 text-sm text-gray-500">
              Your branch will be deployed to: <code>{branch ? `${branch}.${previewDomain}` : '[branch].' + previewDomain}</code>
            </p>
          )}
        </div>
        
        {error && !error.field && (
          <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">
            {error.message}
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <Button color="gray" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            color="primary"
            disabled={!branch || isLoading}
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2" />
                Deploying
              </>
            ) : (
              <>
                <i className="fas fa-rocket mr-2" />
                Deploy
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
} 