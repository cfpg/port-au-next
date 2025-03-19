"use server";

import pool from '~/services/database';
import logger from '~/services/logger';
import { buildAndStartContainer, stopContainer } from '~/services/docker';
import { updateNginxConfig } from '~/services/nginx';
import cloudflare from '~/services/cloudflare';
import { getLatestCommit } from '~/services/git';
import { pullLatestChanges } from '~/services/git';
import fetchAppsQuery from '~/queries/fetchAppsQuery';
import fetchRecentDeploymentsQuery from '~/queries/fetchRecentDeploymentsQuery';

export async function fetchApps() {
  const apps = await fetchAppsQuery();
  return apps;
}

export async function fetchRecentDeployments() {
  const deployments = await fetchRecentDeploymentsQuery();
  return deployments;
}

export async function triggerDeployment(appName: string) {
  let deploymentId: number;

  try {
    // Get app details
    const appResult = await pool.query(
      'SELECT * FROM apps WHERE name = $1',
      [appName]
    );

    if (appResult.rows.length === 0) {
      throw new Error('App not found');
    }

    const app = appResult.rows[0];
    const version = new Date().toISOString().replace(/[^0-9]/g, '');

    // Start deployment record
    const deploymentResult = await pool.query(
      `INSERT INTO deployments (app_id, version, status)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [app.id, version, 'pending']
    );

    deploymentId = deploymentResult.rows[0].id;
    logger.setDeploymentContext(deploymentId);
    await logger.info('Deployment record created', { version });

    // Async deployment process
    (async () => {
      try {
        await logger.info('Starting deployment process');
        await logger.info('Updating deployment status to building');

        await pool.query(
          'UPDATE deployments SET status = $1 WHERE id = $2',
          ['building', deploymentId]
        );

        await logger.info(`Pulling latest changes from branch ${app.branch}`);
        await pullLatestChanges(appName, app.branch);

        const commitId = await getLatestCommit(appName);
        await logger.info('Got latest commit', { commitId });

        await logger.info('Starting new container');
        const { containerId } = await buildAndStartContainer(appName, version, {
          POSTGRES_USER: app.db_user,
          POSTGRES_PASSWORD: app.db_password,
          POSTGRES_DB: app.db_name,
          POSTGRES_HOST: 'postgres'
        });
        await logger.info('Container started successfully', { containerId });

        // Get old container ID if exists
        const oldDeployment = await pool.query(
          `SELECT container_id FROM deployments 
           WHERE app_id = $1 AND status = 'active'`,
          [app.id]
        );

        await logger.info('Updating nginx configuration');
        await updateNginxConfig(appName, app.domain, containerId);
        await logger.info('Nginx configuration updated');

        // Mark new deployment as active
        await logger.info('Marking deployment as active');
        await pool.query(
          `UPDATE deployments 
           SET status = $1, commit_id = $2, container_id = $3 
           WHERE id = $4`,
          ['active', commitId, containerId, deploymentId]
        );

        // If there was a previous deployment, stop its container
        if (oldDeployment.rows.length > 0) {
          const oldContainerId = oldDeployment.rows[0].container_id;
          await logger.info('Stopping old container', { oldContainerId });
          await stopContainer(oldContainerId);

          await pool.query(
            `UPDATE deployments 
             SET status = 'inactive' 
             WHERE container_id = $1`,
            [oldContainerId]
          );
          await logger.info('Old container stopped and marked as inactive');
        }

        // Inside the deployment process, after getting the new commit ID:
        const oldDeploymentCommit = await pool.query(
          `SELECT d.commit_id 
           FROM deployments d
           WHERE app_id = $1 AND status = 'active'
           ORDER BY deployed_at DESC
           LIMIT 1`,
          [app.id]
        );

        const oldCommitId = oldDeploymentCommit.rows[0]?.commit_id;

        if (oldCommitId && app.cloudflare_zone_id) {
          try {
            const changedAssets = await cloudflare.getChangedAssets(
              appName,
              oldCommitId,
              commitId
            );

            if (changedAssets.length > 0) {
              await cloudflare.purgeCache(
                app.domain,
                app.cloudflare_zone_id,
                changedAssets
              );
            }
          } catch (error) {
            await logger.warning('Failed to purge Cloudflare cache', error as Error);
            // Don't fail the deployment if cache purge fails
          }
        } else {
          await logger.info('No Cloudflare zone ID found, skipping cache purge');
        }

        await logger.info('Deployment completed successfully');

      } catch (error) {
        await logger.error('Deployment failed', error as Error);
        await pool.query(
          'UPDATE deployments SET status = $1 WHERE id = $2',
          ['failed', deploymentId]
        );
      } finally {
        // Clear the deployment context when done
        logger.clearDeploymentContext();
      }
    })();

    return {
      success: true,
      message: 'Deployment started',
      deploymentId,
      version
    };
  } catch (error) {
    logger.error('Error initiating deployment', error as Error);
    return {
      success: false,
      error: 'Deployment failed'
    };
  }
}