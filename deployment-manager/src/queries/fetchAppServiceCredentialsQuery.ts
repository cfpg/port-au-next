import pool from '~/services/database';

export default async function fetchAppServiceCredentialsQuery(appId: number, serviceType: string) {
  const results = await pool.query(
    'SELECT * FROM app_services WHERE app_id = $1 AND service_type = $2',
    [appId, serviceType]
  );

  return results.rows;
}