import crypto from 'crypto';

import pool from '~/services/database';
import logger from '~/services/logger';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import insertAppServiceCredentialsQuery from '~/queries/insertAppServiceCredentialsQuery';
import type { App } from '~/types';

export const PORT_SCHEDULE_SERVICE_TYPE = 'port_schedule';

/** Docker Compose service name + internal port on `port_au_next_network` (fixed; not configurable). */
export const PORT_SCHEDULE_INTERNAL_BASE_URL = 'http://port-schedule:8080';

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function tenantRowExists(appId: number): Promise<boolean> {
  const r = await pool.query('SELECT 1 FROM port_schedule.tenants WHERE app_id = $1', [appId]);
  return r.rows.length > 0;
}

async function putAdminCredentials(appId: number, apiKey: string): Promise<void> {
  const master = process.env.PORT_SCHEDULE_MASTER_API_KEY?.trim();
  if (!master) {
    throw new Error('PORT_SCHEDULE_MASTER_API_KEY is not set');
  }
  const url = `${PORT_SCHEDULE_INTERNAL_BASE_URL}/admin/apps/${appId}/credentials`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${master}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`port-schedule admin PUT failed: ${res.status} ${text}`);
  }
}

/**
 * Production app deploys only (not preview branches): ensure `app_services` holds the
 * plaintext API key and `port_schedule.tenants` is in sync. Idempotent on every re-deploy.
 */
export async function ensurePortScheduleForProductionApp(app: App): Promise<Record<string, string>> {
  if (!process.env.PORT_SCHEDULE_MASTER_API_KEY?.trim()) {
    await logger.warning('PORT_SCHEDULE_MASTER_API_KEY not set; skipping port-schedule tenant and env injection', {
      app: app.name,
    });
    return {};
  }

  const rows = await fetchAppServiceCredentialsQuery(app.id, PORT_SCHEDULE_SERVICE_TYPE, false);
  const existing = rows[0];
  let apiKey: string;

  if (existing?.secret_key) {
    apiKey = existing.secret_key;
    if (!(await tenantRowExists(app.id))) {
      await logger.info('port-schedule: tenant row missing; syncing from app_services', {
        appId: app.id,
        app: app.name,
      });
      await putAdminCredentials(app.id, apiKey);
    }
  } else if (existing && !existing.secret_key) {
    apiKey = generateApiKey();
    await pool.query(
      `UPDATE app_services SET secret_key = $1, updated_at = CURRENT_TIMESTAMP
       WHERE app_id = $2 AND service_type = $3 AND is_preview = false`,
      [apiKey, app.id, PORT_SCHEDULE_SERVICE_TYPE]
    );
    await putAdminCredentials(app.id, apiKey);
    await logger.info('port-schedule: backfilled empty secret_key and synced tenant', { appId: app.id, app: app.name });
  } else {
    apiKey = generateApiKey();
    try {
      await insertAppServiceCredentialsQuery(app.id, PORT_SCHEDULE_SERVICE_TYPE, '', apiKey);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === '23505') {
        const again = await fetchAppServiceCredentialsQuery(app.id, PORT_SCHEDULE_SERVICE_TYPE, false);
        if (again[0]?.secret_key) {
          apiKey = again[0].secret_key;
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
    await putAdminCredentials(app.id, apiKey);
    await logger.info('port-schedule: created app_services row and tenant', { appId: app.id, app: app.name });
  }

  return {
    PORT_SCHEDULE_URL: PORT_SCHEDULE_INTERNAL_BASE_URL,
    PORT_SCHEDULE_API_KEY: apiKey,
  };
}
