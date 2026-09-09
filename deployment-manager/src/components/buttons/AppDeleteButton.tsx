"use client";

import { useState } from "react";
import Button from "../general/Button";
import ConfirmDialog from "../general/ConfirmDialog";
import { deleteApp } from "~/app/(dashboard)/apps/[appName]/actions";
import { useRouter } from "next/navigation";

export default function AppDeleteButton({ appName }: { appName: string }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await deleteApp(appName);
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={handleDelete}
        isLoading={isLoading}
        title="Delete app"
        confirmLabel="Permanently delete"
        confirmText={appName}
        description={
          <>
            Are you sure you want to delete this app? This cannot be undone. Type{' '}
            <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1 text-ink">{appName}</span>{' '}
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
