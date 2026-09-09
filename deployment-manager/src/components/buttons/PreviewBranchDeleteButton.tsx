"use client";

import { useState } from "react";
import Button from "../general/Button";
import ConfirmDialog from "../general/ConfirmDialog";
import { deletePreviewBranch } from "~/app/(dashboard)/apps/[appName]/actions";
import { showToast } from "~/components/general/Toaster";

interface PreviewBranchDeleteButtonProps {
  appId: number;
  branch: string;
  onDeleted?: () => void;
}

export default function PreviewBranchDeleteButton({ appId, branch, onDeleted }: PreviewBranchDeleteButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = () => {
    if (isLoading) return;
    setIsDialogOpen(false);
    setError("");
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const result = await deletePreviewBranch(appId, branch);
      if (result.success) {
        handleClose();
        onDeleted?.();
      } else {
        setError(result.message);
        showToast(result.message, 'error');
      }
    } catch (err) {
      console.error('Error deleting preview branch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        isOpen={isDialogOpen}
        onClose={handleClose}
        onConfirm={handleDelete}
        isLoading={isLoading}
        error={error}
        title="Delete preview branch"
        confirmLabel="Delete preview branch"
        confirmText={branch}
        description={
          <>
            This removes the preview branch container, its database, and its subdomain configuration.
            This cannot be undone. Type{' '}
            <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1 text-ink">{branch}</span>{' '}
            to confirm.
          </>
        }
      />

      <Button variant="danger" size="sm" onClick={() => setIsDialogOpen(true)}>
        <i className="fas fa-trash mr-6" />
        Delete
      </Button>
    </>
  );
}
