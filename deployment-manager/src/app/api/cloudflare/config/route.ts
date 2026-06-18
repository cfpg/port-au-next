import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import { decryptSecret, encryptSecret, maskSecret } from '~/lib/encryption';
import {
  deleteCloudflareConfig,
  fetchCloudflareConfig,
  updateSelectedTunnel,
  updateTunnelOriginUrl,
  upsertCloudflareConfig,
} from '~/queries/cloudflareConfigQuery';
import { getCloudflareCredentials } from '~/services/cloudflareClient';
import cloudflareTunnel from '~/services/cloudflareTunnel';
import 'cloudflare/shims/web';
import Cloudflare from 'cloudflare';

export const GET = withAuth(async () => {
  const config = await fetchCloudflareConfig();

  if (!config) {
    const hasEnvFallback = Boolean(
      process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID
    );
    return NextResponse.json({
      connected: false,
      envFallback: hasEnvFallback,
    });
  }

  let tokenLast4 = '';
  try {
    tokenLast4 = maskSecret(decryptSecret(config.api_token_encrypted));
  } catch {
    tokenLast4 = '****';
  }

  return NextResponse.json({
    connected: true,
    accountId: config.account_id,
    tunnelId: config.tunnel_id,
    tunnelName: config.tunnel_name,
    tunnelOriginUrl: config.tunnel_origin_url,
    tokenMasked: tokenLast4,
    connectedAt: config.connected_at,
  });
});

export const PUT = withAuth(async (request: Request) => {
  try {
    const body = await request.json();
    const accountId = String(body.accountId ?? '').trim();
    const apiToken = String(body.apiToken ?? '').trim();
    const tunnelOriginUrl = String(body.tunnelOriginUrl ?? 'http://localhost').trim();

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: 'Account ID and API token are required' },
        { status: 400 }
      );
    }

    const client = new Cloudflare({ apiToken });
    await client.accounts.get({ account_id: accountId });

    await upsertCloudflareConfig({
      accountId,
      apiTokenEncrypted: encryptSecret(apiToken),
      tunnelOriginUrl: tunnelOriginUrl || 'http://localhost',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to connect Cloudflare account';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

export const PATCH = withAuth(async (request: Request) => {
  try {
    const body = await request.json();

    if (body.tunnelOriginUrl) {
      await updateTunnelOriginUrl(String(body.tunnelOriginUrl).trim());
    }

    if (body.tunnelId && body.tunnelName) {
      await updateSelectedTunnel({
        tunnelId: String(body.tunnelId),
        tunnelName: String(body.tunnelName),
      });

      const { syncPlatformServicesOnStartup } = await import(
        '~/services/cloudflarePlatformServices'
      );
      void syncPlatformServicesOnStartup();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Cloudflare settings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

export const DELETE = withAuth(async () => {
  await deleteCloudflareConfig();
  return NextResponse.json({ success: true });
});

export const POST = withAuth(async () => {
  const credentials = await getCloudflareCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'Cloudflare is not connected' }, { status: 400 });
  }

  try {
    const tunnels = await cloudflareTunnel.listTunnels();
    return NextResponse.json({
      success: true,
      accountId: credentials.accountId,
      tunnelCount: tunnels.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
