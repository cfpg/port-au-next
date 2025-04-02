import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Modal from '~/components/general/Modal';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { triggerDeployment } from '~/app/(dashboard)/actions';
import { isPreviewBranchesEnabled } from '~/services/previewBranches';

interface DeployPreviewBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  appName: string;
  appId: number;
  previewDomain?: string;
}

export function DeployPreviewBranchModal({
  isOpen,
  onClose,
  appName,
  appId,
  previewDomain
}: DeployPreviewBranchModalProps) {
  const router = useRouter();
  const [branch, setBranch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Check if preview branches are enabled
      const enabled = await isPreviewBranchesEnabled(appId);
      if (!enabled) {
        toast.error('Preview branches are not enabled for this app');
        return;
      }

      if (!previewDomain) {
        toast.error('Preview domain is not configured');
        return;
      }

      const result = await triggerDeployment(appName, { branch });

      if (result.success) {
        toast.success('Preview branch deployment started');
        router.refresh();
        onClose();
      } else {
        toast.error(result.error || 'Failed to start deployment');
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to start deployment');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Deploy Preview Branch"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            label="Branch Name"
            placeholder="Enter branch name (e.g. dev, feature/new-ui)"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            required
          />
          {previewDomain && (
            <p className="mt-2 text-sm text-gray-500">
              Your branch will be deployed to: <code>{branch ? `${branch}.${previewDomain}` : '[branch].' + previewDomain}</code>
            </p>
          )}
          {!previewDomain && (
            <p className="mt-2 text-sm text-red-500">
              Preview domain not configured. Please configure it in app settings.
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3">
          <Button color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            color="primary"
            disabled={!branch || !previewDomain || isLoading}
          >
            {isLoading ? 'Deploying...' : 'Deploy Branch'}
          </Button>
        </div>
      </form>
    </Modal>
  );
} 