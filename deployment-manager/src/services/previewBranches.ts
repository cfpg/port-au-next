import pool from './database';
import { setupAppDatabase, deleteAppDatabase } from './database';
import logger from './logger';
import { updateNginxConfig, deletePreviewBranchConfig } from './nginx';
import { buildAndStartContainer, stopContainer } from './docker';
import { pullLatestChanges, getLatestCommit } from './git';
import { getPreviewBranchSubdomain, sanitizeBranchForSubdomain } from '~/utils/previewBranches';

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
  await pool.query('BEGIN');
  try {
    // Update app with preview domain
    await pool.query(
      'UPDATE apps SET preview_domain = $1 WHERE id = $2',
      [previewDomain, appId]
    );

    // Create or update feature flag
    await pool.query(`
      INSERT INTO app_features (app_id, feature, enabled, config)
      VALUES ($1, 'preview_branches', true, '{}')
      ON CONFLICT (app_id, feature)
      DO UPDATE SET enabled = true, updated_at = CURRENT_TIMESTAMP
    `, [appId]);

    await pool.query('COMMIT');
    await logger.info('Preview branches enabled', { appId, previewDomain });
  } catch (error) {
    await pool.query('ROLLBACK');
    await logger.error('Failed to enable preview branches', error as Error);
    throw error;
  }
}

export async function setupPreviewBranch({ appId, appName, branch, previewDomain }: PreviewBranchSetup) {
  await pool.query('BEGIN');
  try {
    // Check if preview branch already exists
    const existingBranch = await pool.query(
      'SELECT * FROM preview_branches WHERE app_id = $1 AND branch = $2',
      [appId, branch]
    );

    if (existingBranch.rows.length > 0) {
      throw new Error(`Preview branch ${branch} already exists for app ${appName}`);
    }

    // Create database for preview branch
    const dbPrefix = `${appName}_${sanitizeBranchForSubdomain(branch)}`;
    const { dbUser, dbName, dbPassword } = await setupAppDatabase(dbPrefix);

    // Create preview branch record
    const result = await pool.query(
      `INSERT INTO preview_branches 
       (app_id, branch, subdomain, db_name, db_user, db_password, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [appId, branch, getPreviewBranchSubdomain(branch, previewDomain), dbName, dbUser, dbPassword, 'created']
    );

    await pool.query('COMMIT');
    await logger.info('Preview branch setup completed', { 
      appName, 
      branch,
      previewBranchId: result.rows[0].id 
    });

    return result.rows[0];
  } catch (error) {
    await pool.query('ROLLBACK');
    await logger.error('Failed to setup preview branch', error as Error);
    throw error;
  }
}

export async function deletePreviewBranch(appId: number, branch: string) {
  await pool.query('BEGIN');
  try {
    // Get preview branch details
    const branchResult = await pool.query(
      'SELECT * FROM preview_branches WHERE app_id = $1 AND branch = $2',
      [appId, branch]
    );

    if (branchResult.rows.length === 0) {
      throw new Error('Preview branch not found');
    }

    const previewBranch = branchResult.rows[0];

    // Stop and remove container if exists
    if (previewBranch.container_id) {
      await stopContainer(previewBranch.container_id);
    }

    // Remove nginx config
    const appResult = await pool.query(
      'SELECT name FROM apps WHERE id = $1',
      [appId]
    );
    await deletePreviewBranchConfig(appResult.rows[0].name, branch);

    // Delete database
    await deleteAppDatabase(previewBranch.db_name, previewBranch.db_user);

    // Delete preview branch record
    await pool.query(
      'DELETE FROM preview_branches WHERE id = $1',
      [previewBranch.id]
    );

    await pool.query('COMMIT');
    await logger.info('Preview branch deleted', { appId, branch });
  } catch (error) {
    await pool.query('ROLLBACK');
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

export async function updatePreviewBranchStatus(id: number, status: string, containerId?: string) {
  await pool.query(
    `UPDATE preview_branches 
     SET status = $1, container_id = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $3`,
    [status, containerId, id]
  );
}

export async function deployPreviewBranch(appId: number, branch: string) {
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

    // Pull latest changes
    await pullLatestChanges(app.name, branch);
    const commitId = await getLatestCommit(app.name, branch);

    // Get environment variables for the branch
    const envVarsResult = await pool.query(`
      SELECT key, value 
      FROM app_env_vars 
      WHERE app_id = $1 
      AND (
        (branch = $2 AND is_preview = true) OR
        (branch IS NULL AND is_preview = true)
      )
    `, [appId, branch]);

    const envVars = Object.fromEntries(
      envVarsResult.rows.map(row => [row.key, row.value])
    );

    // Build and start container
    const version = new Date().toISOString().replace(/[^0-9]/g, '');
    const { containerId } = await buildAndStartContainer(app, version, {
      POSTGRES_USER: previewBranch.db_user,
      POSTGRES_PASSWORD: previewBranch.db_password,
      POSTGRES_DB: previewBranch.db_name,
      POSTGRES_HOST: 'postgres',
      BRANCH: branch,
      ...envVars
    });

    // Update nginx config
    await updateNginxConfig(
      app.name,
      app.preview_domain,
      containerId,
      branch
    );

    // Update preview branch status
    await updatePreviewBranchStatus(previewBranch.id, 'active', containerId);

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