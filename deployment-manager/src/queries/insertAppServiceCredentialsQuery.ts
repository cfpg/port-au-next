import pool from '~/services/database';

export default async function insertAppServiceCredentialsQuery(appId: number, serviceType: string, publicKey: string, secretKey: string) {
  return await pool.query(
    `INSERT INTO app_services 
     (app_id, service_type, public_key, secret_key) 
     VALUES ($1, $2, $3, $4)`,
    [appId, serviceType, publicKey, secretKey]
  );
}