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
