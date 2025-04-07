"use server";

import { notFound } from 'next/navigation';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import fetchRecentDeploymentsQuery from '~/queries/fetchRecentDeploymentsQuery';
import pool from '~/services/database';
import logger from '~/services/logger';
import { updateAppEnvVarsQuery } from '~/queries/updateAppEnvVarsQuery';
import cloudflare from '~/services/cloudflare';
import { deleteAppContainers, stopContainer } from '~/services/docker';
import { deleteAppConfig } from '~/services/nginx';
import { deleteRepository } from '~/services/git';
import { deleteAppDatabase, deleteAppRecord } from '~/services/database';
import { withAuth } from '~/lib/auth-utils';
import updateAppSettingsQuery from '~/queries/updateAppSettingsQuery';
import { AppSettings } from '~/types';
import fetchActivePreviewBranchesQuery from '~/queries/fetchActivePreviewBranches';

export const fetchApp = withAuth(async (appName: string) => {
  const app = await fetchSingleAppQuery({appName});
  if (!app) {
    notFound();
  }
  return app;
});

export const fetchAppDeployments = withAuth(async (appId: number) => {
  return fetchRecentDeploymentsQuery(appId);
});

export const fetchActivePreviewBranches = withAuth(async (appId: number) => {
  return fetchActivePreviewBranchesQuery(appId);
});

export const updateAppSettings = withAuth(async (
  appId: number,
  settings: AppSettings
) => {
  try {
    await updateAppSettingsQuery(appId, settings);
    return { success: true };
  } catch (error) {
    await logger.error('Failed to update app settings', error as Error);
    return { success: false, error: 'Failed to update app settings' };
  }
});

export const updateAppEnvVars = withAuth(async (appId: number, branch: string, vars: Record<string, string>) => {
  const result = await updateAppEnvVarsQuery(appId, branch, vars);
  return result;
});

export const fetchZoneId = withAuth(async (appName: string) => {
  // Verify appName is valid
  const app = await fetchSingleAppQuery({appName});
  if (!app || !app.domain) {
    return { success: false, error: 'Invalid app to fetch Cloudflare Zone ID.' };
  }

  const zoneId = await cloudflare.getZoneId(app.domain);

  if (zoneId) {
    await updateAppSettings(app.id, { cloudflare_zone_id: zoneId });
  }

  return zoneId;
});

export const createApp = withAuth(async ({name, repo_url, branch, domain}: {name: string, repo_url: string, branch: string, domain: string,}) => {
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
});

interface DeletionStatus {
  success: boolean;
  containers: { success: boolean; error: string | null };
  nginx: { success: boolean; error: string | null };
  repository: { success: boolean; error: string | null };
  database: { success: boolean; error: string | null };
  appRecord: { success: boolean; error: string | null };
}

export const deleteApp = withAuth(async (appName: string): Promise<{ success: boolean; message: string; details?: DeletionStatus }> => {
  const deletionStatus: DeletionStatus = {
    success: false,
    containers: { success: false, error: null },
    nginx: { success: false, error: null },
    repository: { success: false, error: null },
    database: { success: false, error: null },
    appRecord: { success: false, error: null }
  };

  try {
    // First verify the app exists
    const appResult = await pool.query(
      'SELECT * FROM apps WHERE name = $1',
      [appName]
    );

    if (appResult.rows.length === 0) {
      return { success: false, message: 'App not found' };
    }

    const app = appResult.rows[0];
    await logger.info(`Starting deletion process for app ${appName}`);

    // Delete app data from each service, continuing even if individual steps fail
    try {
      // 1. Stop and remove all containers
      try {
        await deleteAppContainers(appName);
        deletionStatus.containers.success = true;
        await logger.info('Removed all Docker containers');
      } catch (error) {
        deletionStatus.containers.error = (error as Error).message;
        await logger.error('Failed to remove Docker containers', error as Error);
      }

      // 2. Remove nginx configuration
      try {
        await deleteAppConfig(app.domain);
        deletionStatus.nginx.success = true;
        await logger.info('Removed Nginx configuration');
      } catch (error) {
        deletionStatus.nginx.error = (error as Error).message;
        await logger.error('Failed to remove Nginx configuration', error as Error);
      }

      // 3. Remove git repository
      try {
        await deleteRepository(appName);
        deletionStatus.repository.success = true;
        await logger.info('Removed Git repository');
      } catch (error) {
        deletionStatus.repository.error = (error as Error).message;
        await logger.error('Failed to remove Git repository', error as Error);
      }

      // 4. Remove database resources
      try {
        await deleteAppDatabase(app.db_name, app.db_user);
        deletionStatus.database.success = true;
        await logger.info('Removed database resources');
      } catch (error) {
        deletionStatus.database.error = (error as Error).message;
        await logger.error('Failed to remove database resources', error as Error);
      }

      // 5. Finally, remove the app record only if it still exists
      try {
        await deleteAppRecord(app.id);
        deletionStatus.appRecord.success = true;
        await logger.info('Removed app records from management database');
      } catch (error) {
        deletionStatus.appRecord.error = (error as Error).message;
        await logger.error('Failed to remove app records', error as Error);
      }

      // Check if everything was successful
      deletionStatus.success = Object.values(deletionStatus)
        .every(status => status === true || (typeof status === 'object' && status.success === true));

      return {
        success: deletionStatus.success,
        message: deletionStatus.success
          ? `App "${appName}" and all associated resources have been deleted`
          : `App "${appName}" was partially deleted. Some resources may need manual cleanup.`,
        details: deletionStatus
      };

    } catch (error) {
      await logger.error('Unexpected error during app deletion', error as Error);
      return {
        success: false,
        message: 'Failed to complete deletion process',
        details: deletionStatus
      };
    }
  } catch (error) {
    await logger.error('Error initiating app deletion', error as Error);
    return {
      success: false,
      message: 'Failed to initiate app deletion'
    };
  }
});

interface PreviewBranchDeletionStatus {
  success: boolean;
  containers: { success: boolean; error: string | null };
  nginx: { success: boolean; error: string | null };
  database: { success: boolean; error: string | null };
  record: { success: boolean; error: string | null };
}

export const deletePreviewBranch = withAuth(async (appId: number, branch: string): Promise<{ success: boolean; message: string; details?: PreviewBranchDeletionStatus }> => {
  const deletionStatus: PreviewBranchDeletionStatus = {
    success: false,
    containers: { success: false, error: null },
    nginx: { success: false, error: null },
    database: { success: false, error: null },
    record: { success: false, error: null }
  };

  try {
    // First verify the preview branch exists
    const branchResult = await pool.query(
      'SELECT * FROM preview_branches WHERE app_id = $1 AND branch = $2 AND deleted_at IS NULL',
      [appId, branch]
    );

    if (branchResult.rows.length === 0) {
      return { success: false, message: 'Preview branch not found' };
    }

    const previewBranch = branchResult.rows[0];
    await logger.info(`Starting deletion process for preview branch ${branch} of app ${appId}`);

    try {
      // 1. Stop and remove preview branch containers
      try {
        if (previewBranch.container_id) {
          await stopContainer(previewBranch.container_id);
        }
        deletionStatus.containers.success = true;
        await logger.info('Removed preview branch Docker container');
      } catch (error) {
        deletionStatus.containers.error = (error as Error).message;
        await logger.error('Failed to remove preview branch Docker container', error as Error);
      }

      // 2. Remove nginx configuration for the subdomain
      try {
        await deleteAppConfig(previewBranch.subdomain);
        deletionStatus.nginx.success = true;
        await logger.info('Removed preview branch Nginx configuration');
      } catch (error) {
        deletionStatus.nginx.error = (error as Error).message;
        await logger.error('Failed to remove preview branch Nginx configuration', error as Error);
      }

      // 3. Remove preview branch database
      try {
        if (previewBranch.db_name && previewBranch.db_user) {
          await deleteAppDatabase(previewBranch.db_name, previewBranch.db_user);
        }
        deletionStatus.database.success = true;
        await logger.info('Removed preview branch database resources');
      } catch (error) {
        deletionStatus.database.error = (error as Error).message;
        await logger.error('Failed to remove preview branch database resources', error as Error);
      }

      // 4. Soft delete the preview branch record
      try {
        await pool.query(
          'UPDATE preview_branches SET deleted_at = CURRENT_TIMESTAMP WHERE app_id = $1 AND branch = $2',
          [appId, branch]
        );
        deletionStatus.record.success = true;
        await logger.info('Soft deleted preview branch record');
      } catch (error) {
        deletionStatus.record.error = (error as Error).message;
        await logger.error('Failed to soft delete preview branch record', error as Error);
      }

      // Check if everything was successful
      deletionStatus.success = Object.values(deletionStatus)
        .every(status => status === true || (typeof status === 'object' && status.success === true));

      return {
        success: deletionStatus.success,
        message: deletionStatus.success
          ? `Preview branch "${branch}" and all associated resources have been deleted`
          : `Preview branch "${branch}" was partially deleted. Some resources may need manual cleanup.`,
        details: deletionStatus
      };

    } catch (error) {
      await logger.error('Unexpected error during preview branch deletion', error as Error);
      return {
        success: false,
        message: 'Failed to complete preview branch deletion process',
        details: deletionStatus
      };
    }
  } catch (error) {
    await logger.error('Error initiating preview branch deletion', error as Error);
    return {
      success: false,
      message: 'Failed to initiate preview branch deletion'
    };
  }
});
