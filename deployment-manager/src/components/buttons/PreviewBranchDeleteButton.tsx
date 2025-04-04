"use client";

import { useState } from "react";
import Button from "../general/Button";
import Modal from "../general/Modal";
import Input from "../general/Input";
import { deletePreviewBranch } from "~/app/(dashboard)/apps/[appName]/actions";
import { showToast } from "~/components/general/Toaster";

interface PreviewBranchDeleteButtonProps {
  appId: number;
  branch: string;
  onDeleted?: () => void;
}

export default function PreviewBranchDeleteButton({ appId, branch, onDeleted }: PreviewBranchDeleteButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [branchToConfirm, setBranchToConfirm] = useState("");
  const [error, setError] = useState("");

  const handleClose = () => {
    if (!isLoading) {
      setIsModalOpen(false);
      setBranchToConfirm("");
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const result = await deletePreviewBranch(appId, branch);
      if (result.success) {
        handleClose();
        if (onDeleted) {
          onDeleted();
        }
      } else {
        // TODO: Show error toast
        console.error('Failed to delete preview branch:', result.message);

        // Show error message under the input field
        setError(result.message);
        showToast(result.message, 'error');
      }
    } catch (error) {
      console.error('Error deleting preview branch:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title="Delete Preview Branch"
      >
        <div className="flex flex-col gap-4 text-left">
          {isLoading ? (
            <p>Deleting...</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-lg font-bold">Are you sure you want to delete this preview branch?</p>
              <p className="text-sm text-gray-500">
                This will remove all associated resources including:
              </p>
              <ul className="list-disc list-inside mb-2 ml-2">
                <li>The preview branch container</li>
                <li>The preview branch database</li>
                <li>The preview branch subdomain configuration</li>
              </ul>
              <p className="text-sm text-gray-500 mt-2">
                Please type <span className="font-bold">{branch}</span> to confirm.
              </p>
            </div>
          )}
          <Input
            value={branchToConfirm}
            onChange={(e) => setBranchToConfirm(e.target.value)}
            disabled={isLoading}
            placeholder="Enter branch name to confirm"
          />
          {error && <p className="text-red-500 text-sm break-words whitespace-pre-wrap bg-red-100 p-2 rounded-md border-red-200 border">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              color='red'
              disabled={branchToConfirm !== branch || isLoading}
              onClick={handleDelete}
            >
              <i className="fas fa-trash mr-2"></i>
              Delete Preview Branch
            </Button>
            <Button
              disabled={isLoading}
              onClick={handleClose}
              color='gray'
            >
              <i className="fas fa-times mr-2"></i>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Button color='red' size="sm" onClick={() => setIsModalOpen(true)}>
        <i className="fas fa-trash mr-2"></i>
        Delete
      </Button>
    </>
  );
} 