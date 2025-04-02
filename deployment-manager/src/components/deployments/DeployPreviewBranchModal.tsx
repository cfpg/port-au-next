"use client";

import { useState } from "react";
import Modal from "../general/Modal";
import Button from "../general/Button";
import Input from "../general/Input";
import { triggerDeployment } from "~/app/(dashboard)/actions";
import { useToast } from "~/components/general/ToastContainer";

interface DeployPreviewBranchModalProps {
  appName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function DeployPreviewBranchModal({ appName, isOpen, onClose }: DeployPreviewBranchModalProps) {
  const [branch, setBranch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const handleDeploy = async () => {
    if (!branch.trim()) {
      showToast("Please enter a branch name", "error");
      return;
    }

    try {
      setIsLoading(true);
      const result = await triggerDeployment(appName, { branch: branch.trim() });
      if (!result.success) throw new Error(result.error);
      showToast(`Deployment started successfully for branch ${branch}`, "success");
      onClose();
    } catch (error) {
      console.error(`Deployment failed for branch ${branch}:`, error);
      showToast(`Failed to start deployment for branch ${branch}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Deploy Preview Branch">
      <div className="space-y-4 text-left">
        <div>
          <Input
            id="branch"
            type="text"
            label="Branch Name"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="Enter branch name"
            className="mt-1"
          />
        </div>
        <div className="flex justify-end space-x-3">
          <Button onClick={onClose} color="gray-light">
            Cancel
          </Button>
          <Button onClick={handleDeploy} disabled={isLoading}>
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
      </div>
    </Modal>
  );
} 