import pool from '~/services/database';

interface AppSettings {
  name?: string;
  domain?: string;
  repo_url?: string;
  branch?: string;
  cloudflare_zone_id?: string;
}

export default async function updateAppSettingsQuery(
  appId: number,
  settings: AppSettings
): Promise<void> {
  await pool.query(
    `UPDATE apps 
     SET name = COALESCE($1, name),
         domain = COALESCE($2, domain),
         repo_url = COALESCE($3, repo_url),
         branch = COALESCE($4, branch),
         cloudflare_zone_id = COALESCE($5, cloudflare_zone_id)
     WHERE id = $6`,
    [
      settings.name,
      settings.domain,
      settings.repo_url,
      settings.branch,
      settings.cloudflare_zone_id,
      appId
    ]
  );
} 