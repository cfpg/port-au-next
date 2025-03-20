"use server";

import { notFound } from 'next/navigation';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import fetchRecentDeploymentsQuery from '~/queries/fetchRecentDeploymentsQuery';
import { triggerDeployment } from '~/app/actions';
import pool from '~/services/database';
import logger from '~/services/logger';
import { updateAppEnvVarsQuery } from '~/queries/updateAppEnvVarsQuery';
import cloudflare from '~/services/cloudflare';

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

export async function updateAppSettings(
  appId: number,
  settings: {
    name?: string;
    domain?: string;
    repo_url?: string;
    branch?: string;
    cloudflare_zone_id?: string;
  }
) {
  try {
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

    await logger.info('App settings updated', { appId, settings });
    return { success: true };
  } catch (error) {
    await logger.error('Failed to update app settings', error as Error);
    return { success: false, error: 'Failed to update app settings' };
  }
}

export async function updateAppEnvVars(appId: number, branch: string, vars: Record<string, string>) {
  const result = await updateAppEnvVarsQuery(appId, branch, vars);
  
  return result;
}

export async function fetchZoneId(appName: string) {
  // Verify appName is valid
  const app = await fetchSingleAppQuery(appName);
  if (!app || !app.domain) {
    return { success: false, error: 'Invalid app to fetch Cloudflare Zone ID.' };
  }

  const zoneId = await cloudflare.getZoneId(app.domain);
  return zoneId;
}

export async function createApp({name, repo_url, branch, domain}: {name: string, repo_url: string, branch: string, domain: string,}) {
  // Try catch inserting a new app into the table apps and return the app id
  try {
    const result = await pool.query(
      `INSERT INTO apps (name, repo_url, branch, domain) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, repo_url, branch, domain]
    );
    return result.rows[0].id;
  } catch (error) {
    await logger.error('Failed to create app', error as Error);
    return { success: false, error: 'Failed to create app' };
  }
}