"use client";

import { useState } from "react";
import Button from "./general/Button";
import Modal from "./general/Modal";
import { deleteApp } from "~/app/app/[appName]/actions";
import Input from "./general/Input";
import { useRouter } from "next/navigation";

export default function AppDeleteButton({ appName }: { appName: string }) {
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [appNameToConfirm, setAppNameToConfirm] = useState("");
  const router = useRouter();

  return (
    <>
      {isConfirmationModalOpen && (
        <Modal
          title="Delete App"
        >
          <div className="flex flex-col gap-4">
            {isLoading ? <p>Deleting...</p> : (
              <div className="flex flex-col gap-2">
                <p className="text-lg font-bold">Are you sure you want to delete this app?</p>
                <p className="text-sm text-gray-500">Please type <span className="font-bold">{appName}</span> to confirm.</p>
              </div>
            )}
            <Input
              value={appNameToConfirm}
              onChange={(e) => setAppNameToConfirm(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button color='red' disabled={appNameToConfirm !== appName || isLoading} onClick={() => {
                setIsLoading(true);
                deleteApp(appName).then(() => {
                  setIsLoading(false);
                  setIsConfirmationModalOpen(false);
                  router.push("/");
                });
              }}>
                Permanently Delete
              </Button>
              <Button disabled={isLoading} onClick={() => setIsConfirmationModalOpen(false)} color='gray'>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
      <div>
        <Button color='red' onClick={() => setIsConfirmationModalOpen(true)}>
          <i className="fas fa-trash mr-2"></i>
          Delete
        </Button>
      </div>
    </>
  )
}
