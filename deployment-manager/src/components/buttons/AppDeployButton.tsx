"use client";

import { useState } from "react";
import Button from "../general/Button";
import { triggerDeployment } from "~/app/(dashboard)/actions";
import { useToast } from "~/components/general/ToastContainer";
import { usePathname } from "next/navigation";

interface AppDeployButtonProps {
  appName: string;
}

export default function AppDeployButton({ appName }: AppDeployButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();
  const pathname = usePathname();

  return (
    <>
      <Button
        disabled={isLoading}
        size="sm"
        onClick={async () => {
          try {
            setIsLoading(true);
            const result = await triggerDeployment(appName, { pathname });
            if (!result.success) throw new Error(result.error);
            showToast(`Deployment started successfully for ${appName}`, 'success');
          } catch (error) {
            console.error(`Deployment failed for ${appName}:`, error);
            showToast(`Failed to start deployment for ${appName}`, 'error');
          } finally {
            setIsLoading(false);
          }
        }}
      >
        <i className="fas fa-rocket mr-2" />
        Deploy
      </Button>
    </>
  );
}