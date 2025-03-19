import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from '~/services/logger';
import getAppsDir from '~/utils/getAppsDir';

// Instead of using __dirname, we'll go up from the deployment-manager directory
const APPS_DIR = getAppsDir();
console.log("APPS_DIR", APPS_DIR);

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

export async function pullLatestChanges(appName: string, branch: string = 'main') {
  const appDir = path.join(APPS_DIR, appName);

  try {
    // Check if directory exists
    if (!fs.existsSync(appDir)) {
      const error = new Error(`App directory ${appDir} does not exist`);
      await logger.error('Directory check failed', error);
      throw error;
    }

    await logger.info(`Pulling latest changes for branch ${branch}`);
    
    // Pull latest changes
    return new Promise((resolve, reject) => {
      exec(`cd ${appDir} && git fetch && git stash && git checkout ${branch} && git pull origin ${branch}`, (error: Error | null, stdout: string) => {
        if (error) {
          logger.error(`Error pulling latest changes`, error);
          reject(error);
        } else {
          logger.info(`Successfully pulled latest changes`, { stdout: stdout.trim() });
          resolve(stdout);
        }
      });
    });
  } catch (error) {
    await logger.error(`Error in pullLatestChanges`, error as Error);
    throw error;
  }
}

export async function getLatestCommit(appName: string) {
  const appDir = path.join(APPS_DIR, appName);

  return new Promise<string>((resolve, reject) => {
    exec(`cd ${appDir} && git rev-parse HEAD`, (error: Error | null, stdout: string) => {
      if (error) {
        logger.error(`Error getting latest commit`, error);
        reject(error);
      } else {
        const commitId = stdout.trim();
        logger.debug(`Got latest commit`, { commitId });
        resolve(commitId);
      }
    });
  });
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
