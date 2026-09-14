import pool from '~/services/database';

export interface GithubInstallationRow {
  id: number;
  app_id: number;
  installation_id: string; // BIGINT comes back as a string from node-postgres
  account_login: string;
  repo_id: string; // BIGINT
  repo_full_name: string;
  created_at: Date;
  updated_at: Date;
}

export async function findGithubInstallationForApp(appId: number): Promise<GithubInstallationRow | null> {
  const result = await pool.query<GithubInstallationRow>(
    `SELECT id, app_id, installation_id, account_login, repo_id, repo_full_name, created_at, updated_at
     FROM github_installations
     WHERE app_id = $1`,
    [appId]
  );
  return result.rows[0] ?? null;
}

export async function upsertGithubInstallation(input: {
  appId: number;
  installationId: number;
  accountLogin: string;
  repoId: number;
  repoFullName: string;
}): Promise<GithubInstallationRow> {
  const result = await pool.query<GithubInstallationRow>(
    `INSERT INTO github_installations (app_id, installation_id, account_login, repo_id, repo_full_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (app_id) DO UPDATE SET
       installation_id = EXCLUDED.installation_id,
       account_login = EXCLUDED.account_login,
       repo_id = EXCLUDED.repo_id,
       repo_full_name = EXCLUDED.repo_full_name,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, app_id, installation_id, account_login, repo_id, repo_full_name, created_at, updated_at`,
    [input.appId, input.installationId, input.accountLogin, input.repoId, input.repoFullName]
  );
  return result.rows[0];
}

export async function deleteGithubInstallationForApp(appId: number): Promise<void> {
  await pool.query('DELETE FROM github_installations WHERE app_id = $1', [appId]);
}
