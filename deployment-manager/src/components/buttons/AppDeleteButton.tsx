"use client";

import { useState } from "react";
import Button from "../general/Button";
import Modal from "../general/Modal";
import { deleteApp } from "~/app/(dashboard)/apps/[appName]/actions";
import Input from "../general/Input";
import { useRouter } from "next/navigation";

export default function AppDeleteButton({ appName }: { appName: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [appNameToConfirm, setAppNameToConfirm] = useState("");
  const router = useRouter();

  const handleClose = () => {
    if (!isLoading) {
      setIsModalOpen(false);
      setAppNameToConfirm("");
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await deleteApp(appName);
      handleClose();
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title="Delete App"
      >
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <p>Deleting...</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-lg font-bold">Are you sure you want to delete this app?</p>
              <p className="text-sm text-gray-500">Please type <span className="font-bold">{appName}</span> to confirm.</p>
            </div>
          )}
          <Input
            value={appNameToConfirm}
            onChange={(e) => setAppNameToConfirm(e.target.value)}
            disabled={isLoading}
          />
          <div className="flex justify-end gap-2">
            <Button 
              color='red' 
              disabled={appNameToConfirm !== appName || isLoading} 
              onClick={handleDelete}
            >
              <i className="fas fa-trash mr-2"></i>
              Permanently Delete
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

      <Button color='red' onClick={() => setIsModalOpen(true)}>
        <i className="fas fa-trash mr-2"></i>
        Delete
      </Button>
    </>
  );
}
