'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { showToast } from '~/components/general/Toaster';
import SettingsInstructionsToggleable from '~/components/general/SettingsInstructionsToggleable';

interface ObjectStorageCardProps {
  app: App;
}

interface ObjectStorageCredentials {
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export default function ObjectStorageCard({ app }: ObjectStorageCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [credentials, setCredentials] = useState<ObjectStorageCredentials | null>(null);

  const { data, mutate } = useSWR<ObjectStorageCredentials>(
    `/api/apps/${app.id}/object-storage`,
    fetcher
  );

  useEffect(() => {
    if (data) {
      setCredentials(data);
    }
  }, [data]);

  const handleEnable = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/object-storage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to enable object storage');
      }

      await mutate();
      showToast('Object storage enabled successfully', 'success');
    } catch (error) {
      showToast('Failed to enable object storage', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Object Storage</h3>
          <p className="text-sm text-gray-500">
            Enable S3-compatible object storage for your app
          </p>
        </div>
        {!credentials && (
          <Button
            color="blue"
            onClick={handleEnable}
            disabled={isUpdating}
          >
            Enable
          </Button>
        )}
      </div>

      {credentials ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Bucket"
              value={credentials.bucket}
              disabled
              readOnly
            />
            <Input
              label="Access Key"
              value={credentials.accessKey}
              disabled
              readOnly
            />
          </div>
          <Input
            label="Secret Key"
            value={credentials.secretKey}
            disabled
            readOnly
            showToggle
            className="mt-4"
          />
          <SettingsInstructionsToggleable title="Using Object Storage in Your App">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Using Object Storage in Your App</h4>
            <p className="text-sm text-blue-700">
              These environment variables are automatically available in your app:
            </p>
            <div className="mt-2 bg-white p-3 rounded border border-blue-200">
              <code className="text-sm">
                MINIO_HOST<br />
                MINIO_ACCESS_KEY<br />
                MINIO_SECRET_KEY<br />
                MINIO_BUCKET
              </code>
            </div>
            <p className="mt-2 text-sm text-blue-700">
              You can use them to initialize the Minio client in your Node.js app:
            </p>
            <div className="mt-2 bg-white p-3 rounded border border-blue-200">
              <code className="text-sm">
                import &#123; Client &#125; from 'minio';<br /><br />
                const minioClient = new Client(&#123;<br />
                &nbsp;&nbsp;endPoint: process.env.MINIO_HOST,<br />
                &nbsp;&nbsp;useSSL: true,<br />
                &nbsp;&nbsp;accessKey: process.env.MINIO_ACCESS_KEY,<br />
                &nbsp;&nbsp;secretKey: process.env.MINIO_SECRET_KEY<br />
                &#125;);
              </code>
            </div>
          </SettingsInstructionsToggleable>
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-md">
          <p className="text-sm text-gray-600">
            Object storage is not enabled for this app. Enable it to get S3-compatible storage for your files.
          </p>
        </div>
      )}
    </div>
  );
} 