import pool, { withTransaction } from './database';
import { setupAppDatabase, deleteAppDatabase } from './database';
import logger from './logger';
import { updateNginxConfig, deletePreviewBranchConfig } from './nginx';
import { stopContainer } from './docker';
import { runReleasePipeline } from './releasePipeline';
import { getPreviewBranchSubdomain, slugifyBranchForResourceName } from '~/utils/previewBranches';

interface PreviewBranchSetup {
  appId: number;
  appName: string;
  branch: string;
  previewDomain: string;
}

export async function isPreviewBranchesEnabled(appId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT enabled FROM app_features 
     WHERE app_id = $1 AND feature = 'preview_branches'`,
    [appId]
  );
  return result.rows[0]?.enabled || false;
}

export async function enablePreviewBranches(appId: number, previewDomain: string) {
  try {
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE apps SET preview_domain = $1 WHERE id = $2',
        [previewDomain, appId]
      );

      await client.query(`
        INSERT INTO app_features (app_id, feature, enabled, config)
        VALUES ($1, 'preview_branches', true, '{}')
        ON CONFLICT (app_id, feature)
        DO UPDATE SET enabled = true, updated_at = CURRENT_TIMESTAMP
      `, [appId]);
    });
    await logger.info('Preview branches enabled', { appId, previewDomain });
  } catch (error) {
    await logger.error('Failed to enable preview branches', error as Error);
    throw error;
  }
}

export async function setupPreviewBranch({ appId, appName, branch, previewDomain }: PreviewBranchSetup) {
  const existingBranch = await pool.query(
    'SELECT id FROM preview_branches WHERE app_id = $1 AND branch = $2',
    [appId, branch]
  );
  if (existingBranch.rows.length > 0) {
    throw new Error(`Preview branch ${branch} already exists for app ${appName}`);
  }

  // CREATE DATABASE can't run inside a SQL transaction, so this step is necessarily
  // outside the one below - if the row insert doesn't commit, we compensate manually.
  const dbPrefix = `${appName}_${slugifyBranchForResourceName(branch)}`;
  const { dbUser, dbName, dbPassword } = await setupAppDatabase(dbPrefix);

  try {
    const row = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO preview_branches
         (app_id, branch, subdomain, db_name, db_user, db_password, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [appId, branch, getPreviewBranchSubdomain(branch, previewDomain), dbName, dbUser, dbPassword, 'created']
      );
      return result.rows[0];
    });

    await logger.info('Preview branch setup completed', {
      appName,
      branch,
      previewBranchId: row.id
    });

    return row;
  } catch (error) {
    try {
      await deleteAppDatabase(dbName, dbUser);
    } catch (cleanupError) {
      await logger.error(
        'Failed to clean up orphaned preview database after failed setup',
        cleanupError as Error
      );
    }
    await logger.error('Failed to setup preview branch', error as Error);
    throw error;
  }
}

interface PreviewBranchResourceRow {
  id: number;
  branch: string;
  container_id: string | null;
  db_name: string | null;
  db_user: string | null;
}

export interface PreviewBranchCleanupResult {
  success: boolean;
  errors: string[];
}

/**
 * Stops the container, removes the nginx config, and drops the database for a preview
 * branch, WITHOUT touching its `preview_branches` row. Shared by `deletePreviewBranch`
 * and app deletion (`deleteAppRecord`), which must clean up resources before the row can
 * be safely deleted (deployments still reference it until they're deleted first).
 *
 * Returns which steps failed rather than swallowing them - a caller that deletes the row
 * (and with it the credentials/metadata needed to retry) regardless of the result would
 * turn a failed database drop into a permanently unreachable orphaned database.
 */
export async function cleanupPreviewBranchResources(
  previewBranch: PreviewBranchResourceRow,
  appName: string
): Promise<PreviewBranchCleanupResult> {
  const errors: string[] = [];

  if (previewBranch.container_id) {
    try {
      await stopContainer(previewBranch.container_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`container: ${message}`);
      await logger.warning('Failed to stop preview branch container during cleanup', {
        previewBranchId: previewBranch.id,
        error: message,
      });
    }
  }

  try {
    await deletePreviewBranchConfig(appName, previewBranch.branch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`nginx config: ${message}`);
    await logger.warning('Failed to remove preview branch nginx config during cleanup', {
      previewBranchId: previewBranch.id,
      error: message,
    });
  }

  if (previewBranch.db_name && previewBranch.db_user) {
    try {
      await deleteAppDatabase(previewBranch.db_name, previewBranch.db_user);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`database: ${message}`);
      await logger.warning('Failed to delete preview branch database during cleanup', {
        previewBranchId: previewBranch.id,
        error: message,
      });
    }
  }

  return { success: errors.length === 0, errors };
}

export async function deletePreviewBranch(appId: number, branch: string) {
  const branchResult = await pool.query(
    'SELECT * FROM preview_branches WHERE app_id = $1 AND branch = $2',
    [appId, branch]
  );
  if (branchResult.rows.length === 0) {
    throw new Error('Preview branch not found');
  }
  const previewBranch = branchResult.rows[0];

  // Refuse rather than tear down a container/database an enqueued-or-running deploy job
  // might still be using. (Not airtight against a job enqueued in the instant after this
  // check - closing that fully is follow-up work, not something this refactor needs.)
  const activeJob = await pool.query(
    `SELECT id FROM deploy_queue_jobs WHERE app_id = $1 AND branch = $2 AND status IN ('queued', 'running') LIMIT 1`,
    [appId, branch]
  );
  if (activeJob.rows.length > 0) {
    throw new Error('An active or queued deployment exists for this preview branch. Wait for it to finish before deleting.');
  }

  try {
    const appResult = await pool.query('SELECT name FROM apps WHERE id = $1', [appId]);
    const appName = appResult.rows[0]?.name;

    const cleanup = await cleanupPreviewBranchResources(previewBranch, appName);
    if (!cleanup.success) {
      // Don't delete the row - it still holds the container/db credentials a retry needs.
      throw new Error(`Preview branch cleanup incomplete, record retained for retry: ${cleanup.errors.join('; ')}`);
    }

    await pool.query('DELETE FROM preview_branches WHERE id = $1', [previewBranch.id]);

    await logger.info('Preview branch deleted', { appId, branch });
  } catch (error) {
    await logger.error('Failed to delete preview branch', error as Error);
    throw error;
  }
}

export async function getPreviewBranch(appId: number, branch: string) {
  const result = await pool.query(
    'SELECT * FROM preview_branches WHERE app_id = $1 AND branch = $2',
    [appId, branch]
  );
  return result.rows[0] || null;
}

/**
 * Gets-or-creates (or restores, if soft-deleted) the preview_branches row for a branch.
 * Must run BEFORE a deployments row is created for that branch - `deployments.is_preview
 * = true` requires a non-null `preview_branch_id` (CHECK constraint), so provisioning
 * can't happen after the fact inside the executor.
 */
export async function ensurePreviewBranch(
  app: { id: number; name: string; preview_domain?: string },
  branch: string
) {
  const enabled = await isPreviewBranchesEnabled(app.id);
  if (!enabled) {
    throw new Error('Preview branches are not enabled for this app');
  }
  if (!app.preview_domain) {
    throw new Error('Preview domain is not configured');
  }

  let previewBranch = await getPreviewBranch(app.id, branch);
  if (!previewBranch) {
    previewBranch = await setupPreviewBranch({
      appId: app.id,
      appName: app.name,
      branch,
      previewDomain: app.preview_domain,
    });
  } else if (previewBranch.deleted_at) {
    await pool.query('UPDATE preview_branches SET deleted_at = NULL WHERE id = $1', [previewBranch.id]);
    await logger.info('Restored soft-deleted preview branch', { branch, previewBranchId: previewBranch.id });
  }

  return previewBranch;
}

export async function updatePreviewBranchStatus(id: number, status: string, containerId?: string) {
  await pool.query(
    `UPDATE preview_branches 
     SET status = $1, container_id = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $3`,
    [status, containerId, id]
  );
}

export async function deployPreviewBranch(
  appId: number,
  branch: string,
  deploymentId: number,
  commitSha: string,
  version?: string
) {
  try {
    // Get app details
    const appResult = await pool.query(
      'SELECT * FROM apps WHERE id = $1',
      [appId]
    );

    if (appResult.rows.length === 0) {
      throw new Error('App not found');
    }

    const app = appResult.rows[0];

    // Get preview branch details
    const previewBranch = await getPreviewBranch(appId, branch);
    if (!previewBranch) {
      throw new Error('Preview branch not found');
    }

    // Update status to deploying
    await updatePreviewBranchStatus(previewBranch.id, 'deploying');

    const commitId = commitSha;

    const releaseVersion =
      version ?? new Date().toISOString().replace(/[^0-9]/g, '');
    const appEnv = {
      POSTGRES_USER: previewBranch.db_user,
      POSTGRES_PASSWORD: previewBranch.db_password,
      POSTGRES_DB: previewBranch.db_name,
      POSTGRES_HOST: 'postgres',
      BRANCH: branch,
      DATABASE_URL: `postgres://${previewBranch.db_user}:${previewBranch.db_password}@postgres:5432/${previewBranch.db_name}`,
    };

    const oldContainerId = previewBranch.container_id;
    const { containerId } = await runReleasePipeline({
      app,
      version: releaseVersion,
      branch,
      commitSha,
      appEnv,
      deploymentId,
      switchTraffic: async (_id, depId, routingHostname) =>
        updateNginxConfig(
          app.name,
          previewBranch.subdomain,
          routingHostname,
          branch,
          depId,
          { requireApplied: true }
        ),
    });

    await updatePreviewBranchStatus(previewBranch.id, 'active', containerId);

    if (oldContainerId && oldContainerId !== containerId) {
      try {
        await stopContainer(oldContainerId);
      } catch (error) {
        await logger.warning('Failed to stop old preview container', {
          oldContainerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await logger.info('Preview branch deployed successfully', {
      appName: app.name,
      branch,
      containerId,
      commitId
    });

    return { 
      success: true,
      containerId,
      commitId
    };
  } catch (error) {
    await logger.error('Preview branch deployment failed', error as Error);
    throw error;
  }
}
