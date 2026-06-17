import 'cloudflare/shims/web';
import Cloudflare from 'cloudflare';
import { decryptSecret } from '~/lib/encryption';
import { fetchCloudflareConfig } from '~/queries/cloudflareConfigQuery';

export interface CloudflareCredentials {
  client: Cloudflare;
  accountId: string;
  tunnelId: string | null;
  tunnelName: string | null;
  tunnelOriginUrl: string;
  source: 'database' | 'env';
}

function createClientFromEnv(): Cloudflare | null {
  const apiKey = process.env.CLOUDFLARE_API_KEY?.trim();
  const apiEmail = process.env.CLOUDFLARE_API_EMAIL?.trim();

  if (!apiKey) return null;

  if (apiEmail) {
    return new Cloudflare({ apiEmail, apiKey });
  }

  return new Cloudflare({ apiToken: apiKey });
}

export async function getCloudflareCredentials(): Promise<CloudflareCredentials | null> {
  const config = await fetchCloudflareConfig();

  if (config) {
    return {
      client: new Cloudflare({
        apiToken: decryptSecret(config.api_token_encrypted),
      }),
      accountId: config.account_id,
      tunnelId: config.tunnel_id,
      tunnelName: config.tunnel_name,
      tunnelOriginUrl: config.tunnel_origin_url || 'http://localhost',
      source: 'database',
    };
  }

  const client = createClientFromEnv();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

  if (!client || !accountId) {
    return null;
  }

  return {
    client,
    accountId,
    tunnelId: process.env.CLOUDFLARE_TUNNEL_ID?.trim() || null,
    tunnelName: process.env.CLOUDFLARE_TUNNEL_NAME?.trim() || null,
    tunnelOriginUrl: process.env.CLOUDFLARE_TUNNEL_ORIGIN_URL?.trim() || 'http://localhost',
    source: 'env',
  };
}

export async function isCloudflareConnected(): Promise<boolean> {
  return (await getCloudflareCredentials()) !== null;
}
