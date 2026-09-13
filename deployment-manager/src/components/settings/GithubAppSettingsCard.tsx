'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import Textarea from '~/components/general/Textarea';
import { showToast } from '~/components/general/Toaster';
import Disclosure from '~/components/general/Disclosure';
import CodeToken from '~/components/general/CodeToken';
import Callout from '~/components/general/Callout';
import fetcher from '~/utils/fetcher';

interface GithubAppConfigStatus {
  connected: boolean;
  appSlug?: string;
  appId?: string;
  clientId?: string | null;
  privateKeyMasked?: string;
  webhookSecretMasked?: string;
}

export default function GithubAppSettingsCard() {
  const { data: config, mutate: mutateConfig } = useSWR<GithubAppConfigStatus>(
    '/api/github/config',
    fetcher
  );

  const [appSlug, setAppSlug] = useState('');
  const [appId, setAppId] = useState('');
  const [clientId, setClientId] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const connected = config?.connected === true;

  const handleSave = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/github/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appSlug, appId, clientId, privateKeyPem, webhookSecret }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save GitHub App configuration');

      setPrivateKeyPem('');
      setWebhookSecret('');
      await mutateConfig();
      showToast('GitHub App configured', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save configuration', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/github/config', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to remove GitHub App configuration');
      await mutateConfig();
      showToast('GitHub App configuration removed', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove configuration', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-24">
      <Callout tone="warning">
        Manual deployment only in this release - a connected app&apos;s Deploy button can pull a
        private repository, but pushing to GitHub does not trigger anything yet.
      </Callout>

      {!connected ? (
        <div className="flex flex-col gap-14">
          <p className="text-field text-ink-muted">
            Register a GitHub App once for this platform, then connect individual apps to their
            repositories from each app&apos;s settings page.
          </p>

          <Disclosure title="How to create a GitHub App">
            <div className="flex flex-col gap-14 text-panel text-ink-muted">
              <div>
                <div className="font-display font-semibold text-ink mb-3">1. Create the App</div>
                <p>
                  Go to{' '}
                  <strong className="font-semibold text-ink">
                    GitHub Settings &rarr; Developer settings &rarr; GitHub Apps &rarr; New GitHub App
                  </strong>
                  . Any owner account works (personal or org).
                </p>
              </div>
              <div>
                <div className="font-display font-semibold text-ink mb-3">2. Set permissions</div>
                <ul className="list-disc list-inside flex flex-col gap-3">
                  <li>Repository permissions &rarr; Contents: Read-only</li>
                  <li>Repository permissions &rarr; Metadata: Read-only</li>
                </ul>
                <p className="mt-9">No webhook subscription is required yet - this release only supports manual deploys.</p>
              </div>
              <div>
                <div className="font-display font-semibold text-ink mb-3">3. Generate a private key</div>
                <p>
                  On the App&apos;s page, scroll to <strong className="font-semibold text-ink">Private keys</strong> and click{' '}
                  <strong className="font-semibold text-ink">Generate a private key</strong> - this downloads a
                  <span className="font-mono text-meta bg-surface border border-line-token rounded-badge px-5 py-1 mx-3">.pem</span>
                  file. Paste its full contents below.
                </p>
              </div>
              <div>
                <div className="font-display font-semibold text-ink mb-3">4. Set a webhook secret</div>
                <p>
                  Even without a webhook enabled yet, set a{' '}
                  <strong className="font-semibold text-ink">Webhook secret</strong> on the App now (any
                  random string) and paste the same value below - the next release will verify
                  incoming webhook signatures against it.
                </p>
              </div>
              <div>
                <a
                  href="https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary-active"
                >
                  GitHub docs: Registering a GitHub App
                </a>
              </div>
            </div>
          </Disclosure>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-14">
            <Input
              id="gh-app-slug"
              label="App slug"
              value={appSlug}
              onChange={(e) => setAppSlug(e.target.value)}
              placeholder="my-port-au-next-deployer"
              hint="From the App's public page URL: github.com/apps/<slug>"
            />
            <Input
              id="gh-app-id"
              label="App ID"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="123456"
            />
            <Input
              id="gh-client-id"
              label="Client ID (optional)"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Iv1.xxxxxxxxxxxxxxxx"
            />
            <Input
              id="gh-webhook-secret"
              label="Webhook secret"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="A random string, saved on the App too"
              showToggle
            />
            <Textarea
              id="gh-private-key"
              label="Private key (.pem contents)"
              value={privateKeyPem}
              onChange={(e) => setPrivateKeyPem(e.target.value)}
              placeholder="-----BEGIN RSA PRIVATE KEY-----..."
              className="col-span-full font-mono"
              rows={6}
            />
          </div>
          <div>
            <Button variant="primary" onClick={handleSave} loading={isBusy}>
              Save GitHub App
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-14">
          <div className="flex flex-wrap items-center justify-between gap-10">
            <div className="flex flex-col gap-3">
              <p className="text-field text-ink-muted">
                App <CodeToken>{config?.appSlug}</CodeToken> &middot; ID <CodeToken>{config?.appId}</CodeToken>
              </p>
              <p className="text-field text-ink-muted">
                Private key <CodeToken>{config?.privateKeyMasked}</CodeToken> &middot; Webhook secret{' '}
                <CodeToken>{config?.webhookSecretMasked}</CodeToken>
              </p>
            </div>
            <Button variant="danger" onClick={handleDisconnect} disabled={isBusy}>
              Remove configuration
            </Button>
          </div>
          <p className="text-field text-ink-muted">
            Connect individual apps to a repository from that app&apos;s settings page.
          </p>
        </div>
      )}
    </div>
  );
}
