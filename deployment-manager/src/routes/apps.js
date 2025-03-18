const express = require('express');
const router = express.Router();
const { setupAppDatabase } = require('../services/database');
const { updateNginxConfig } = require('../services/nginx');
const { cloneRepository, pullLatestChanges, getLatestCommit } = require('../services/git');
const { stopContainer, buildAndStartContainer } = require('../services/docker');
const { pool } = require('../config/database');
const logger = require('../services/logger');
const cloudflare = require('../services/cloudflare');
const docker = require('../services/docker');
const nginx = require('../services/nginx');
const git = require('../services/git');
const database = require('../services/database');

console.log('Registering apps routes...');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
             d.status as latest_status,
             d.deployed_at as latest_deployment_date
      FROM apps a
      LEFT JOIN LATERAL (
        SELECT id, status, deployed_at
        FROM deployments
        WHERE app_id = a.id
        ORDER BY deployed_at DESC
        LIMIT 1
      ) d ON true
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(`Error in /api/apps endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { name, repo_url, branch = 'main', domain } = req.body;

  try {
    if (!name || !repo_url || !domain) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if app already exists
    const existingApp = await pool.query(
      'SELECT * FROM apps WHERE name = $1 OR domain = $2',
      [name, domain]
    );

    let isUpdate = false;
    if (existingApp.rows.length > 0) {
      const existing = existingApp.rows[0];

      if (existing.domain !== domain && existing.name === name) {
        return res.status(409).json({ error: `App with name "${name}" already exists` });
      }

      if (existing.domain === domain && existing.name !== name) {
        return res.status(409).json({ error: `Domain "${domain}" is already in use by app "${existing.name}"` });
      }

      // App exists with same name and domain - update it
      console.log(`Updating existing app ${name}`);
      isUpdate = true;
    }

    let cloudflare_zone_id = null;

    // Try to get Zone ID if domain is provided
    if (domain) {
      try {
        cloudflare_zone_id = await cloudflare.getZoneId(domain);
      } catch (error) {
        await logger.warning('Failed to fetch Cloudflare Zone ID', { domain }, error);
        // Continue without Zone ID - cache purging will be skipped
      }
    }

    // Setup database (creates or updates)
    const dbCredentials = await setupAppDatabase(name);

    // Database operation (create or update)
    if (isUpdate) {
      await pool.query(
        `UPDATE apps 
         SET repo_url = $1, branch = $2, 
             db_name = $3, db_user = $4, db_password = $5, cloudflare_zone_id = $6
         WHERE name = $7`,
        [
          repo_url, branch,
          dbCredentials.dbName,
          dbCredentials.dbUser,
          dbCredentials.dbPassword,
          cloudflare_zone_id,
          name
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO apps (
          name, repo_url, branch, domain, 
          db_name, db_user, db_password, cloudflare_zone_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          name, repo_url, branch, domain,
          dbCredentials.dbName,
          dbCredentials.dbUser,
          dbCredentials.dbPassword,
          cloudflare_zone_id
        ]
      );
    }

    // If we got here, database operations succeeded
    // Now setup git and nginx
    try {
      await cloneRepository(name, repo_url, branch);
      await updateNginxConfig(name, domain);
    } catch (setupError) {
      console.error(`Error setting up git/nginx: ${setupError.message}`);
      // We might want to add a status field to the apps table to mark this
      // as partially configured
    }

    res.status(isUpdate ? 200 : 201).json({
      message: isUpdate ? `App "${name}" updated successfully` : `App "${name}" created successfully`,
      name,
      repo_url,
      branch,
      domain
    });

  } catch (error) {
    console.error(`Error registering app: ${error.message}`);
    res.status(500).json({ error: 'Failed to register app' });
  }
});

router.get('/:name/deployments', async (req, res) => {
  const { name } = req.params;

  try {
    const result = await pool.query(`
      SELECT d.* 
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      WHERE a.name = $1
      ORDER BY d.deployed_at DESC
    `, [name]);

    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching deployments for ${name}: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:name/deploy', async (req, res) => {
  const { name } = req.params;
  let deploymentId;

  try {
    // Get app details
    const appResult = await pool.query(
      'SELECT * FROM apps WHERE name = $1',
      [name]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
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
        await pullLatestChanges(name, app.branch);

        const commitId = await getLatestCommit(name);
        await logger.info('Got latest commit', { commitId });

        await logger.info('Starting new container');
        const { containerId } = await buildAndStartContainer(name, version, {
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
        await updateNginxConfig(name, app.domain, containerId);
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
              name,
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
            await logger.warning('Failed to purge Cloudflare cache', error);
            // Don't fail the deployment if cache purge fails
          }
        } else {
          await logger.info('No Cloudflare zone ID found, skipping cache purge');
        }

        await logger.info('Deployment completed successfully');

      } catch (error) {
        await logger.error('Deployment failed', error);
        await pool.query(
          'UPDATE deployments SET status = $1 WHERE id = $2',
          ['failed', deploymentId]
        );
      } finally {
        // Clear the deployment context when done
        logger.clearDeploymentContext();
      }
    })();

    res.json({
      message: 'Deployment started',
      deploymentId,
      version
    });
  } catch (error) {
    logger.error('Error initiating deployment', error);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

// Add environment variables for an app
router.post('/:name/env', async (req, res) => {
  try {
    const { name } = req.params;
    const { branch = 'main', vars } = req.body;

    if (!vars || typeof vars !== 'object') {
      return res.status(400).json({ error: 'Invalid environment variables format' });
    }

    // Get app ID
    const appResult = await pool.query(
      'SELECT id FROM apps WHERE name = $1',
      [name]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appId = appResult.rows[0].id;

    // Insert or update environment variables
    for (const [key, value] of Object.entries(vars)) {
      await pool.query(`
        INSERT INTO app_env_vars (app_id, branch, key, value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (app_id, branch, key)
        DO UPDATE SET value = EXCLUDED.value
      `, [appId, branch, key, value]);
    }

    res.json({ message: 'Environment variables updated successfully' });
  } catch (error) {
    console.error(`Error updating env vars: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get environment variables for an app
router.get('/:name/env', async (req, res) => {
  try {
    const { name } = req.params;
    const { branch = 'main' } = req.query;

    // Get app ID
    const appResult = await pool.query(
      'SELECT id FROM apps WHERE name = $1',
      [name]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appId = appResult.rows[0].id;

    // Get environment variables
    const envVarsResult = await pool.query(
      'SELECT key, value FROM app_env_vars WHERE app_id = $1 AND branch = $2',
      [appId, branch]
    );

    res.json(envVarsResult.rows);
  } catch (error) {
    console.error(`Error fetching env vars: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add this new route to get deployment logs
router.get('/:name/deployments/:deploymentId/logs', async (req, res) => {
  try {
    const { name, deploymentId } = req.params;

    // Verify the deployment belongs to the app
    const deploymentResult = await pool.query(`
      SELECT d.id 
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      WHERE a.name = $1 AND d.id = $2
    `, [name, deploymentId]);

    if (deploymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const logs = await logger.getDeploymentLogs(deploymentId);
    res.json(logs);
  } catch (error) {
    console.error(`Error fetching deployment logs: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single app details
router.get('/:name', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM apps WHERE name = $1',
      [req.params.name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching app:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch Zone ID from Cloudflare
router.get('/:name/fetch-zone-id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT domain FROM apps WHERE name = $1',
      [req.params.name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    const { domain } = result.rows[0];
    const zoneId = await cloudflare.getZoneId(domain);

    if (!zoneId) {
      return res.status(404).json({ error: 'Zone ID not found for domain' });
    }

    res.json({ zoneId });
  } catch (error) {
    console.error('Error fetching Zone ID:', error);
    res.status(500).json({ error: 'Failed to fetch Zone ID' });
  }
});

// Update app settings
router.post('/:name/settings', async (req, res) => {
  const { name } = req.params;
  const { name: newName, domain, repo_url, branch, cloudflare_zone_id } = req.body;

  try {
    // First check if the app exists
    const appResult = await pool.query(
      'SELECT * FROM apps WHERE name = $1',
      [name]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    // If name is being changed, check if new name is available
    if (newName !== name) {
      const nameCheck = await pool.query(
        'SELECT * FROM apps WHERE name = $1 AND name != $2',
        [newName, name]
      );
      if (nameCheck.rows.length > 0) {
        return res.status(409).json({ error: 'App name already taken' });
      }
    }

    // If domain is being changed, check if new domain is available
    if (domain !== appResult.rows[0].domain) {
      const domainCheck = await pool.query(
        'SELECT * FROM apps WHERE domain = $1 AND name != $2',
        [domain, name]
      );
      if (domainCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Domain already in use' });
      }
    }

    // Update the app settings
    await pool.query(
      `UPDATE apps 
       SET name = $1, domain = $2, repo_url = $3, branch = $4, cloudflare_zone_id = $5
       WHERE name = $6`,
      [newName, domain, repo_url, branch, cloudflare_zone_id, name]
    );

    await logger.info(`Updated settings for app ${name}${newName !== name ? ` (renamed to ${newName})` : ''}`);
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    await logger.error('Error updating app settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Add this alternative route
router.delete('/:name', async (req, res) => {
  const { name } = req.params;
  const { confirmationName } = req.body;

  if (!confirmationName || confirmationName !== name) {
    return res.status(400).json({ 
      error: 'Confirmation name does not match app name' 
    });
  }

  const deletionStatus = {
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
      [name]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    const app = appResult.rows[0];
    await logger.info(`Starting deletion process for app ${name}`);

    // Delete app data from each service, continuing even if individual steps fail
    try {
      // 1. Stop and remove all containers
      try {
        await docker.deleteAppContainers(name);
        deletionStatus.containers.success = true;
        await logger.info('Removed all Docker containers');
      } catch (error) {
        deletionStatus.containers.error = error.message;
        await logger.error('Failed to remove Docker containers', error);
      }

      // 2. Remove nginx configuration
      try {
        await nginx.deleteAppConfig(app.domain);
        deletionStatus.nginx.success = true;
        await logger.info('Removed Nginx configuration');
      } catch (error) {
        deletionStatus.nginx.error = error.message;
        await logger.error('Failed to remove Nginx configuration', error);
      }

      // 3. Remove git repository
      try {
        await git.deleteRepository(name);
        deletionStatus.repository.success = true;
        await logger.info('Removed Git repository');
      } catch (error) {
        deletionStatus.repository.error = error.message;
        await logger.error('Failed to remove Git repository', error);
      }

      // 4. Remove database resources
      try {
        await database.deleteAppDatabase(app.db_name, app.db_user);
        deletionStatus.database.success = true;
        await logger.info('Removed database resources');
      } catch (error) {
        deletionStatus.database.error = error.message;
        await logger.error('Failed to remove database resources', error);
      }

      // 5. Finally, remove the app record only if it still exists
      try {
        await database.deleteAppRecord(app.id);
        deletionStatus.appRecord.success = true;
        await logger.info('Removed app records from management database');
      } catch (error) {
        deletionStatus.appRecord.error = error.message;
        await logger.error('Failed to remove app records', error);
      }

      // Check if everything was successful
      deletionStatus.success = Object.values(deletionStatus)
        .every(status => status === true || (typeof status === 'object' && status.success === true));

      const statusCode = deletionStatus.success ? 200 : 207; // Use 207 Multi-Status if partial success
      res.status(statusCode).json({
        message: deletionStatus.success 
          ? `App "${name}" and all associated resources have been deleted`
          : `App "${name}" was partially deleted. Some resources may need manual cleanup.`,
        details: deletionStatus
      });

    } catch (error) {
      await logger.error('Unexpected error during app deletion', error);
      res.status(500).json({ 
        error: 'Failed to complete deletion process',
        details: deletionStatus
      });
    }
  } catch (error) {
    console.error(`Error initiating app deletion: ${error.message}`);
    res.status(500).json({ error: 'Failed to initiate app deletion' });
  }
});

module.exports = router; 