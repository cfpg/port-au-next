import pool from '~/services/database';
import logger from '~/services/logger';
import { stopContainer } from '~/services/docker';
import { runReleasePipeline } from '~/services/releasePipeline';
import { updateNginxConfig } from '~/services/nginx';
import cloudflare from '~/services/cloudflare';
import { prepareWorkspaceAtCommit } from '~/services/git';
import { updateDeploymentStatus, markDeploymentInactiveByContainerId } from '~/services/deploymentStatus';
import { deployPreviewBranch } from '~/services/previewBranches';
import { resolveGitAuth } from '~/services/resolveGitAuth';
import { App } from '~/types';

export interface ExecuteDeploymentParams {
  app: App;
  job: {
    id: number;
    branch: string;
    requested_sha: string | null;
    source?: 'manual' | 'webhook';
    installation_id?: string | null;
    repo_id?: string | null;
  };
  deploymentId: number;
  isPreviewBranch: boolean;
  version: string;
}

/**
 * The single place that actually performs a deployment - preview-branch provisioning if
 * needed, git workspace preparation, and the release pipeline (which persists
 * container/commit and flips status to 'active' itself; see releasePipeline.ts). Called
 * from exactly one place (deployQueue.ts's runJob), so there is no second path to keep in
 * sync with this one. Throws on failure - the caller decides what "failed" means.
 */
export async function executeDeployment({
  app,
  job,
  deploymentId,
  isPreviewBranch,
  version,
}: ExecuteDeploymentParams): Promise<void> {
  const targetBranch = job.branch;

  await logger.info('Starting deployment process');
  await updateDeploymentStatus(deploymentId, 'building');

  // Preview-branch provisioning (setup/restore) already happened in deployQueue.ts's
  // runJob BEFORE this deployment row was created - that row's preview_branch_id is a
  // NOT NULL-checked column when is_preview is true, so the branch must already exist by
  // the time we get here.

  // A webhook job carries the exact installation/repository it was accepted against, so
  // resolveGitAuth can detect - before any git/credential work runs - that the app's
  // connection changed while the job was waiting in the queue (see
  // resolveGitAuth.ts's GithubConnectionChangedError). Manual jobs have no such captured
  // identity and use the plain (repo_url-only) check, exactly as before.
  const gitAuth =
    job.source === 'webhook'
      ? await resolveGitAuth(app, {
          installationId: job.installation_id ?? '',
          repoId: job.repo_id ?? '',
        })
      : await resolveGitAuth(app);

  await logger.info(`Preparing workspace for branch ${targetBranch}`);
  const { commitSha } = await prepareWorkspaceAtCommit(
    app.name,
    targetBranch,
    job.requested_sha ?? undefined,
    gitAuth
  );

  // Backfill so the queue table shows exactly what a manual deploy (requested_sha=NULL,
  // meaning "resolve to branch tip") actually resolved to.
  await pool.query(
    'UPDATE deploy_queue_jobs SET requested_sha = COALESCE(requested_sha, $1) WHERE id = $2',
    [commitSha, job.id]
  );

  if (isPreviewBranch) {
    await deployPreviewBranch(app.id, targetBranch, deploymentId, commitSha, version);
    await logger.info('Deployment completed successfully');
    return;
  }

  const oldDeployment = await pool.query(
    `SELECT container_id, commit_id FROM deployments
     WHERE app_id = $1 AND status = 'active' AND COALESCE(is_preview, FALSE) = FALSE
     ORDER BY id DESC LIMIT 1`,
    [app.id]
  );
  const oldContainerId = oldDeployment.rows[0]?.container_id;
  const oldCommitId = oldDeployment.rows[0]?.commit_id;

  const domain = app.domain;
  if (!domain) {
    throw new Error(`App ${app.name} has no domain configured`);
  }
  if (!app.db_user || !app.db_password || !app.db_name) {
    throw new Error(`App ${app.name} has no database configured`);
  }

  const appEnv = {
    POSTGRES_USER: app.db_user,
    POSTGRES_PASSWORD: app.db_password,
    POSTGRES_DB: app.db_name,
    POSTGRES_HOST: 'postgres',
    BRANCH: targetBranch,
    DATABASE_URL: `postgres://${app.db_user}:${app.db_password}@postgres:5432/${app.db_name}`,
  };

  await runReleasePipeline({
    app,
    version,
    branch: targetBranch,
    commitSha,
    appEnv,
    deploymentId,
    switchTraffic: async (_id, depId, routingHostname) =>
      updateNginxConfig(app.name, domain, routingHostname, undefined, depId, { requireApplied: true }),
  });

  if (oldContainerId) {
    try {
      await logger.info('Stopping old container', { oldContainerId });
      await stopContainer(oldContainerId);
      await logger.info('Old container stopped and marked as inactive');
    } catch (error) {
      await logger.warning('Failed to stop old container - new deployment is still active', {
        oldContainerId,
        error: (error as Error).message,
      });
    } finally {
      await markDeploymentInactiveByContainerId(oldContainerId);
    }
  }

  if (oldCommitId && app.cloudflare_zone_id) {
    try {
      const changedAssets = await cloudflare.getChangedAssets(app.name, oldCommitId, commitSha);
      if (changedAssets.length > 0) {
        await cloudflare.purgeCache(domain, app.cloudflare_zone_id, changedAssets);
      }
    } catch (error) {
      await logger.warning('Failed to purge Cloudflare cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await logger.info('Deployment completed successfully');
}
