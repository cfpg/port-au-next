'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { showToast } from '~/components/general/Toaster';
import Disclosure from '~/components/general/Disclosure';
import Callout from '~/components/general/Callout';
import FieldGroup from '~/components/general/FieldGroup';

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
    } catch {
      showToast('Failed to enable object storage', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-16">
      <div className="flex items-start justify-between gap-16">
        <div>
          <div className="font-display font-semibold text-panel">Object Storage</div>
          <div className="text-field text-ink-muted mt-3">Enable S3-compatible object storage for your app.</div>
        </div>
        {!credentials && (
          <Button variant="primary" onClick={handleEnable} loading={isUpdating}>
            Enable
          </Button>
        )}
      </div>

      {credentials ? (
        <div className="flex flex-col gap-14">
          <FieldGroup>
            <Input label="Bucket" value={credentials.bucket} disabled readOnly />
            <Input label="Access Key" value={credentials.accessKey} disabled readOnly />
          </FieldGroup>
          <Input label="Secret Key" value={credentials.secretKey} disabled readOnly showToggle />

          <Disclosure title="Using Object Storage in Your App">
            <p className="text-panel text-ink-muted mb-9">
              These environment variables are automatically available in your app:
            </p>
            <div className="bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink mb-9">
              MINIO_HOST<br />
              MINIO_ACCESS_KEY<br />
              MINIO_SECRET_KEY<br />
              MINIO_BUCKET
            </div>
            <p className="text-panel text-ink-muted mb-9">
              You can use them to initialize the Minio client in your Node.js app:
            </p>
            <div className="bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink">
              import &#123; Client &#125; from &apos;minio&apos;;<br /><br />
              const minioClient = new Client(&#123;<br />
              &nbsp;&nbsp;endPoint: process.env.MINIO_HOST,<br />
              &nbsp;&nbsp;useSSL: true,<br />
              &nbsp;&nbsp;accessKey: process.env.MINIO_ACCESS_KEY,<br />
              &nbsp;&nbsp;secretKey: process.env.MINIO_SECRET_KEY<br />
              &#125;);
            </div>
          </Disclosure>
        </div>
      ) : (
        <Callout tone="info">
          Object storage is not enabled for this app. Enable it to get S3-compatible storage for your files.
        </Callout>
      )}
    </div>
  );
}
