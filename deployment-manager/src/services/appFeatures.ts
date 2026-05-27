import pool from '~/services/database';
import { AppFeature } from '~/types/appFeatures';

export async function isUsesPrismaEnabled(appId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT enabled FROM app_features WHERE app_id = $1 AND feature = $2`,
    [appId, AppFeature.USES_PRISMA]
  );
  return result.rows[0]?.enabled ?? false;
}
