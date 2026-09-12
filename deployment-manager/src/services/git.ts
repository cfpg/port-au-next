import { exec, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import logger from '~/services/logger';
import getAppsDir from '~/utils/getAppsDir';

const execFile = promisify(execFileCb);

// Instead of using __dirname, we'll go up from the deployment-manager directory
const APPS_DIR = getAppsDir();

export async function isGitRepo(dir: string) {
  return new Promise((resolve) => {
    fs.access(path.join(dir, '.git'), fs.constants.F_OK, (err: Error | null) => {
      resolve(!err);
    });
  });
}

export async function cloneRepository(appName: string, repoUrl: string, branch: string = 'main') {
  const appDir = path.join(APPS_DIR, appName);

  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(appDir)) {
      await logger.info(`Creating directory ${appDir}`);
      fs.mkdirSync(appDir, { recursive: true });
    }

    // Check if it's already a git repository
    const isRepo = await isGitRepo(appDir);
    
    if (isRepo) {
      await logger.info(`Repository already exists at ${appDir}, updating instead...`);
      return new Promise<void>((resolve, reject) => {
        exec(`cd ${appDir} && git fetch && git stash && git checkout ${branch} && git pull origin ${branch}`, (error: Error | null) => {
          if (error) {
            logger.error(`Error updating repository`, error);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    // If not a repo, clone it
    await logger.info(`Cloning repository from ${repoUrl}`);
    return new Promise<void>((resolve, reject) => {
      exec(`git clone -b ${branch} ${repoUrl} ${appDir}`, (error: Error | null) => {
        if (error) {
          logger.error(`Error cloning repository`, error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    await logger.error(`Error in repository setup`, error as Error);
    throw error;
  }
}

export class CommitNotFoundError extends Error {
  constructor(branch: string, requestedSha: string, actualSha: string) {
    super(
      `Requested commit ${requestedSha} for branch ${branch} was not found after fetch ` +
      `(branch now resolves to ${actualSha} - it may have been force-pushed past the requested commit)`
    );
    this.name = 'CommitNotFoundError';
  }
}

/**
 * Fetches `branch`, then lands the checkout on an exact commit: `requestedSha` if given,
 * otherwise the branch's current tip (resolved here, once, not left to a later `git pull`
 * to land wherever the branch happens to be by then).
 *
 * Follows the same shape as the old pullLatestChanges(): stash first so any local drift
 * (e.g. a previous deploy's .env write or Next.js config patch) is preserved in git's
 * stash rather than silently discarded, then check out the target branch - required
 * because this checkout is shared across every branch of the app, so switching from
 * whatever was checked out last is necessary, not optional. The final `reset --hard` to
 * the exact target commit is the one destructive step this function can't avoid (a plain
 * `pull` can't land on an arbitrary historical SHA), but by that point local changes are
 * already safely stashed and we're confirmed to be on the right branch.
 */
export async function prepareWorkspaceAtCommit(
  appName: string,
  branch: string,
  requestedSha?: string
): Promise<{ commitSha: string }> {
  if (appName.includes('/') || appName.includes('..')) {
    throw new Error('Invalid app name');
  }
  const appDir = path.join(APPS_DIR, appName);
  if (!appDir.startsWith(APPS_DIR)) {
    throw new Error('Invalid app directory path');
  }

  if (!fs.existsSync(appDir)) {
    const error = new Error(`App directory ${appDir} does not exist`);
    await logger.error('Directory check failed', error);
    throw error;
  }

  // The final reset below is destructive and must only ever run inside a checkout this
  // platform itself owns. Require appDir to have its OWN .git (not one git would find by
  // walking up to a parent directory) - git commands run with `-C appDir` still search
  // upward for a repo if appDir isn't one itself.
  if (!(await isGitRepo(appDir))) {
    throw new Error(`${appDir} is not a git repository - refusing to run destructive git operations here`);
  }

  try {
    await logger.info(`Fetching branch ${branch}`, { appDir });
    await execFile('git', ['-C', appDir, 'fetch', 'origin', branch]);

    // `git stash` exits 0 with "No local changes to save" when there's nothing to stash,
    // so this is always safe to run.
    await execFile('git', ['-C', appDir, 'stash']);

    try {
      await execFile('git', ['-C', appDir, 'checkout', branch]);
    } catch {
      await execFile('git', ['-C', appDir, 'checkout', '-b', branch, `origin/${branch}`]);
    }

    const targetRef = requestedSha ?? `origin/${branch}`;
    await execFile('git', ['-C', appDir, 'reset', '--hard', targetRef]);

    const { stdout } = await execFile('git', ['-C', appDir, 'rev-parse', 'HEAD']);
    const commitSha = stdout.trim();

    if (requestedSha && commitSha !== requestedSha) {
      throw new CommitNotFoundError(branch, requestedSha, commitSha);
    }

    await logger.info(`Workspace prepared at commit ${commitSha}`, { branch, commitSha });
    return { commitSha };
  } catch (error) {
    await logger.error('Error preparing workspace', error as Error);
    throw error;
  }
}

export async function deleteRepository(appName: string) {
  try {
    // Validate appName doesn't contain path traversal attempts
    if (appName.includes('/') || appName.includes('..')) {
      throw new Error('Invalid app name');
    }

    const appDir = path.join(APPS_DIR, appName);
    
    // Ensure the path is still within APPS_DIR after joining
    if (!appDir.startsWith(APPS_DIR)) {
      throw new Error('Invalid app directory path');
    }
    
    // Check if directory exists before trying to delete
    if (fs.existsSync(appDir)) {
      // Use fs.rm instead of exec for better security
      await fs.promises.rm(appDir, { 
        recursive: true, 
        force: true 
      });
    }
  } catch (error) {
    await logger.error(`Error deleting repository`, error as Error);
    throw error;
  }
}
