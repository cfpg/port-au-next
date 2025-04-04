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
import { revalidatePath } from 'next/cache';
import { withAuth } from '~/lib/auth-utils';
import { 
  isPreviewBranchesEnabled, 
  setupPreviewBranch, 
  getPreviewBranch,
  deployPreviewBranch 
} from '~/services/previewBranches';

export const fetchApps = withAuth(async () => {
  const apps = await fetchAppsQuery();
  return apps;
});

export const fetchRecentDeployments = withAuth(async () => {
  const deployments = await fetchRecentDeploymentsQuery();
  return deployments;
});

export const triggerDeployment = withAuth(async (appName: string, { pathname, branch }: { pathname?: string; branch?: string } = {}) => {
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
    const targetBranch = branch || app.branch;
    const isPreviewBranch = branch && branch !== app.branch;
    let previewBranch = null;

    // If this is a preview branch deployment, check if preview branches are enabled
    if (isPreviewBranch) {
      const enabled = await isPreviewBranchesEnabled(app.id);
      if (!enabled) {
        throw new Error('Preview branches are not enabled for this app');
      }

      if (!app.preview_domain) {
        throw new Error('Preview domain is not configured');
      }

      // Check if preview branch db entry exists, if not set it up
      previewBranch = await getPreviewBranch(app.id, targetBranch);
      if (!previewBranch) {
        previewBranch = await setupPreviewBranch({
          appId: app.id,
          appName,
          branch: targetBranch,
          previewDomain: app.preview_domain
        });
      } else if (previewBranch.deleted_at) {
        // If preview branch exists but is soft-deleted, restore it
        await pool.query(
          'UPDATE preview_branches SET deleted_at = NULL WHERE id = $1',
          [previewBranch.id]
        );
        await logger.info('Restored soft-deleted preview branch', { 
          branch: targetBranch,
          previewBranchId: previewBranch.id 
        });
      }
    }

    // Start deployment record
    const deploymentResult = await pool.query(
      `INSERT INTO deployments (app_id, version, status, branch, is_preview, preview_branch_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [app.id, version, 'pending', targetBranch, isPreviewBranch, isPreviewBranch ? previewBranch.id : null]
    );

    deploymentId = deploymentResult.rows[0].id;
    logger.setDeploymentContext(deploymentId);
    await logger.info('Deployment record created', { 
      version, 
      branch: targetBranch, 
      isPreview: isPreviewBranch,
      previewBranchId: isPreviewBranch ? previewBranch.id : null 
    });

    // Revalidate path if available
    if (pathname) {
      revalidatePath(pathname);
    }

    // Async deployment process
    (async () => {
      try {
        await logger.info('Starting deployment process');
        await logger.info('Updating deployment status to building');

        await pool.query(
          'UPDATE deployments SET status = $1 WHERE id = $2',
          ['building', deploymentId]
        );

        if (isPreviewBranch) {
          // Handle preview branch deployment
          const result = await deployPreviewBranch(app.id, targetBranch);
          
          // Update deployment status with container ID and commit ID from preview branch deployment
          await logger.info('Marking deployment as active');
          await pool.query(
            `UPDATE deployments 
             SET status = $1, commit_id = $2, container_id = $3 
             WHERE id = $4`,
            ['active', result.commitId, result.containerId, deploymentId]
          );
        } else {
          // Handle production branch deployment (existing logic)
          await logger.info(`Pulling latest changes from branch ${targetBranch}`);
          await pullLatestChanges(appName, targetBranch);

          const commitId = await getLatestCommit(appName, targetBranch);
          await logger.info('Got latest commit', { commitId });

          // Get environment variables for the branch
          const envVarsResult = await pool.query(`
            SELECT key, value 
            FROM app_env_vars 
            WHERE app_id = $1 
            AND (
              (branch = $2 AND is_preview = false) OR
              (branch IS NULL AND is_preview = false)
            )
          `, [app.id, targetBranch]);

          const envVars = Object.fromEntries(
            envVarsResult.rows.map(row => [row.key, row.value])
          );

          await logger.info('Starting new container');
          const { containerId } = await buildAndStartContainer(appName, version, {
            POSTGRES_USER: app.db_user,
            POSTGRES_PASSWORD: app.db_password,
            POSTGRES_DB: app.db_name,
            POSTGRES_HOST: 'postgres',
            BRANCH: targetBranch,
            ...envVars
          });
          await logger.info('Container started successfully', { containerId });

          // Get old container ID if exists for this branch
          const oldDeployment = await pool.query(
            `SELECT container_id FROM deployments 
             WHERE app_id = $1 AND status = 'active' AND branch = $2`,
            [app.id, targetBranch]
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

          // If there was a previous deployment for this branch, stop its container
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

          // Handle Cloudflare cache purging for production deployments
          const oldDeploymentCommit = await pool.query(
            `SELECT d.commit_id 
             FROM deployments d
             WHERE app_id = $1 AND status = 'active' AND branch = $2
             ORDER BY deployed_at DESC
             LIMIT 1`,
            [app.id, targetBranch]
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
          }
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
      error: (error as Error).message || 'Deployment failed'
    };
  }
});