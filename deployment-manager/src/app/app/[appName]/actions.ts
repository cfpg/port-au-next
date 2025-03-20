"use server";

import { notFound } from 'next/navigation';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import fetchRecentDeploymentsQuery from '~/queries/fetchRecentDeploymentsQuery';
import { triggerDeployment } from '~/app/actions';
import pool from '~/services/database';
import logger from '~/services/logger';
import { updateAppEnvVarsQuery } from '~/queries/updateAppEnvVarsQuery';
import { revalidatePath } from 'next/cache';

export async function fetchApp(appName: string) {
  const app = await fetchSingleAppQuery(appName);
  if (!app) {
    notFound();
  }
  return app;
}

export async function fetchAppDeployments(appId: number) {
  return fetchRecentDeploymentsQuery(appId);
}

export async function updateAppEnvVars(appId: number, branch: string, envVars: Record<string, string>) {
  try {
    // Delete existing env vars for this app and branch
    await pool.query(
      'DELETE FROM app_env_vars WHERE app_id = $1 AND branch = $2',
      [appId, branch]
    );

    // Insert new env vars
    for (const [key, value] of Object.entries(envVars)) {
      await pool.query(
        'INSERT INTO app_env_vars (app_id, branch, key, value) VALUES ($1, $2, $3, $4)',
        [appId, branch, key, value]
      );
    }

    await logger.info('Environment variables updated', { appId, branch });
    return { success: true };
  } catch (error) {
    await logger.error('Failed to update environment variables', error as Error);
    return { success: false, error: 'Failed to update environment variables' };
  }
}

export async function updateAppSettings(
  appId: number,
  settings: {
    domain?: string;
    db_name?: string;
    db_user?: string;
    db_password?: string;
    cloudflare_zone_id?: string;
  }
) {
  try {
    await pool.query(
      `UPDATE apps 
       SET domain = COALESCE($1, domain),
           db_name = COALESCE($2, db_name),
           db_user = COALESCE($3, db_user),
           db_password = COALESCE($4, db_password),
           cloudflare_zone_id = COALESCE($5, cloudflare_zone_id)
       WHERE id = $6`,
      [
        settings.domain,
        settings.db_name,
        settings.db_user,
        settings.db_password,
        settings.cloudflare_zone_id,
        appId
      ]
    );

    await logger.info('App settings updated', { appId, settings });
    return { success: true };
  } catch (error) {
    await logger.error('Failed to update app settings', error as Error);
    return { success: false, error: 'Failed to update app settings' };
  }
}

export async function updateEnvVars(appId: number, branch: string, vars: Record<string, string>) {
  const result = await updateAppEnvVarsQuery(appId, branch, vars);
  
  return result;
}

export { triggerDeployment }; 