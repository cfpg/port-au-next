import pool from '~/services/database';

export default async function fetchAppServiceCredentialsQuery(appId: number, serviceType: string, isPreview: boolean = false) {
  const results = await pool.query(
    'SELECT * FROM app_services WHERE app_id = $1 AND service_type = $2 AND is_preview = $3',
    [appId, serviceType, isPreview]
  );

  return results.rows;
}