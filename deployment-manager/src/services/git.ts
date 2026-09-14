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

/** True if `dir` exists and contains no entries. False (not "empty") if it doesn't exist. */
function isEmptyDirectory(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return false;
  }
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

export interface GitAuthEnv {
  /** Credential-free origin URL, e.g. https://x-access-token@github.com/owner/repo.git */
  cloneUrl: string;
  askpassPath: string;
  token: string;
}

function buildAuthenticatedExecEnv(auth: GitAuthEnv | undefined): NodeJS.ProcessEnv {
  // A NEW object passed only to this one subprocess call - never assigned onto
  // process.env, so the token never becomes visible to any other code running in this
  // process (including, notably, the app-build step's own env-string construction).
  if (!auth) {
    return process.env;
  }
  return {
    ...process.env,
    GIT_ASKPASS: auth.askpassPath,
    GIT_TOKEN: auth.token,
    GIT_TERMINAL_PROMPT: '0',
  };
}

// Prepended to the argv of any authenticated network-touching git call (clone, fetch).
// GIT_ASKPASS only controls how git OBTAINS a credential - a configured credential helper
// (e.g. `store`, `osxkeychain`) can still independently persist the token it receives to
// disk once authentication succeeds. Disabling the helper for just these two invocations
// (via a one-off `-c`, not a repo-wide `git config` write) means the token this platform
// hands to git never has a code path that writes it to disk, regardless of what credential
// helper the host happens to have configured. Unconnected apps never pass `auth`, so this
// never runs for them - their existing git configuration (helper included) is untouched.
const DISABLE_CREDENTIAL_HELPER_ARGS = ['-c', 'credential.helper='];

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
 *
 * `auth`, when given (a GitHub-App-connected app), does two things: (1) if the directory
 * doesn't exist yet, or exists but is empty (a deferred clone - either the app was created
 * before GitHub access was connected, or a previous deferred-clone attempt created the
 * directory and then failed before `git clone` completed), performs the initial `git clone`
 * here instead of throwing - so a failed first clone doesn't permanently strand the app with
 * an empty, non-git directory that every subsequent deploy would otherwise skip cloning into
 * and then fail against with "not a git repository"; (2) refreshes `origin` to
 * `auth.cloneUrl` (credential-free - safe to persist) and supplies the token only to the
 * network-touching calls (clone/fetch) via GIT_ASKPASS, per-subprocess, with the host's
 * configured git credential helper disabled for those same two calls so nothing besides
 * this platform's own in-memory cache can ever persist the token to disk. An app with no
 * `auth` behaves exactly as before - unconnected SSH/public-repo deploys are unaffected. A
 * directory that exists, is non-empty, and isn't a git repo is still refused untouched (the
 * `isGitRepo` check below throws before any destructive operation runs against it).
 */
export async function prepareWorkspaceAtCommit(
  appName: string,
  branch: string,
  requestedSha?: string,
  auth?: GitAuthEnv
): Promise<{ commitSha: string }> {
  if (appName.includes('/') || appName.includes('..')) {
    throw new Error('Invalid app name');
  }
  const appDir = path.join(APPS_DIR, appName);
  if (!appDir.startsWith(APPS_DIR)) {
    throw new Error('Invalid app directory path');
  }

  const execEnv = buildAuthenticatedExecEnv(auth);

  try {
    const dirExists = fs.existsSync(appDir);

    if (!dirExists && !auth) {
      const error = new Error(`App directory ${appDir} does not exist`);
      await logger.error('Directory check failed', error);
      throw error;
    }

    if (auth && (!dirExists || isEmptyDirectory(appDir))) {
      // Deferred clone: either this app was created before a GitHub connection existed, or
      // a previous deferred-clone attempt got as far as creating appDir and then failed
      // before `git clone` completed. Either way there's nothing here yet worth preserving
      // - (re)do the clone now, authenticated.
      await logger.info('Performing deferred initial clone', { appDir });
      fs.mkdirSync(appDir, { recursive: true });
      await execFile(
        'git',
        [...DISABLE_CREDENTIAL_HELPER_ARGS, 'clone', '--branch', branch, auth.cloneUrl, appDir],
        { env: execEnv }
      );
    }

    // The reset below is destructive and must only ever run inside a checkout this
    // platform itself owns. Require appDir to have its OWN .git (not one git would find by
    // walking up to a parent directory) - git commands run with `-C appDir` still search
    // upward for a repo if appDir isn't one itself.
    if (!(await isGitRepo(appDir))) {
      throw new Error(`${appDir} is not a git repository - refusing to run destructive git operations here`);
    }

    if (auth) {
      // Credential-free - safe to persist in .git/config. Refreshed every call so a
      // change to the app's repo_url (rare) or a stale origin from before this app was
      // connected doesn't silently keep fetching from the wrong place.
      await execFile('git', ['-C', appDir, 'remote', 'set-url', 'origin', auth.cloneUrl]);
    }

    await logger.info(`Fetching branch ${branch}`, { appDir });
    await execFile(
      'git',
      [...(auth ? DISABLE_CREDENTIAL_HELPER_ARGS : []), '-C', appDir, 'fetch', 'origin', branch],
      { env: execEnv }
    );

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
