import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import { maskSecret } from '~/lib/encryption';
import { fetchGithubAppConfig, deleteGithubAppConfig } from '~/queries/githubAppConfigQuery';
import { saveGithubAppConfig } from '~/services/githubApp';

export const GET = withAuth(async () => {
  const config = await fetchGithubAppConfig();

  if (!config) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    appSlug: config.app_slug,
    appId: config.app_id,
    clientId: config.client_id,
    // Never return decrypted secrets to the browser - masked display only, same
    // convention as Cloudflare's config route.
    privateKeyMasked: maskSecret(config.private_key_encrypted),
    webhookSecretMasked: maskSecret(config.webhook_secret_encrypted),
    connectedAt: config.connected_at,
  });
});

export const PUT = withAuth(async (request: Request) => {
  try {
    const body = await request.json();
    const appSlug = String(body.appSlug ?? '').trim();
    const appId = String(body.appId ?? '').trim();
    const clientId = String(body.clientId ?? '').trim();
    const privateKeyPem = String(body.privateKeyPem ?? '').trim();
    const webhookSecret = String(body.webhookSecret ?? '').trim();

    if (!appSlug || !appId || !privateKeyPem || !webhookSecret) {
      return NextResponse.json(
        { error: 'App slug, App ID, private key, and webhook secret are all required' },
        { status: 400 }
      );
    }

    if (!privateKeyPem.includes('BEGIN') || !privateKeyPem.includes('PRIVATE KEY')) {
      return NextResponse.json(
        { error: 'That does not look like a PEM private key (paste the full .pem file contents)' },
        { status: 400 }
      );
    }

    await saveGithubAppConfig({
      appSlug,
      appId,
      clientId: clientId || null,
      privateKeyPem,
      webhookSecret,
    });

    // Any cached installation tokens were minted against whatever key/config was active
    // before - drop them so a config change (e.g. rotating the private key) takes effect
    // on the very next deploy rather than reusing a token derived from the old key.
    const { clearInstallationTokenCache } = await import('~/services/githubApp');
    clearInstallationTokenCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save GitHub App configuration';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

export const DELETE = withAuth(async () => {
  await deleteGithubAppConfig();
  const { clearInstallationTokenCache } = await import('~/services/githubApp');
  clearInstallationTokenCache();
  return NextResponse.json({ success: true });
});
