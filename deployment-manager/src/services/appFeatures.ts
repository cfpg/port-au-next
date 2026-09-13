import pool from '~/services/database';
import { AppFeature } from '~/types/appFeatures';

export interface UsesPrismaFeatureState {
  enabled: boolean;
  autoMigrate: boolean;
}

export async function isUsesPrismaEnabled(appId: number): Promise<boolean> {
  const state = await getUsesPrismaFeature(appId);
  return state.enabled;
}

export async function isAutoMigrateEnabled(appId: number): Promise<boolean> {
  const state = await getUsesPrismaFeature(appId);
  return state.enabled && state.autoMigrate;
}

export async function getUsesPrismaFeature(appId: number): Promise<UsesPrismaFeatureState> {
  const result = await pool.query(
    `SELECT enabled, config FROM app_features WHERE app_id = $1 AND feature = $2`,
    [appId, AppFeature.USES_PRISMA]
  );

  const row = result.rows[0];
  if (!row?.enabled) {
    return { enabled: false, autoMigrate: false };
  }

  const config = row.config ?? {};
  return {
    enabled: true,
    autoMigrate: config.auto_migrate === true,
  };
}

export async function isAutoDeployEnabled(appId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT enabled FROM app_features WHERE app_id = $1 AND feature = $2`,
    [appId, AppFeature.AUTO_DEPLOY]
  );
  return result.rows[0]?.enabled === true;
}

/**
 * Explicitly turns Auto-deploy off and persists that as a real row (not just "absent" =
 * off by default) - used when disconnecting GitHub from an app, so a later reconnect can
 * never silently inherit a stale `enabled = true` row from before the disconnect.
 */
export async function disableAutoDeploy(appId: number): Promise<void> {
  await pool.query(
    `INSERT INTO app_features (app_id, feature, enabled, config)
     VALUES ($1, $2, FALSE, '{}')
     ON CONFLICT (app_id, feature) DO UPDATE SET enabled = FALSE, updated_at = CURRENT_TIMESTAMP`,
    [appId, AppFeature.AUTO_DEPLOY]
  );
}
