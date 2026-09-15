import pool from '~/services/database';

export default async function insertAppServiceCredentialsQuery(
  appId: number,
  serviceType: string,
  publicKey: string,
  secretKey: string,
  isPreview: boolean = false
) {
  return await pool.query(
    `INSERT INTO app_services
     (app_id, service_type, public_key, secret_key, is_preview)
     VALUES ($1, $2, $3, $4, $5)`,
    [appId, serviceType, publicKey, secretKey, isPreview]
  );
}