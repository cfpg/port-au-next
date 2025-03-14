const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const APPS_DIR = path.join(__dirname, '../../apps');

async function isGitRepo(dir) {
  return new Promise((resolve) => {
    fs.access(path.join(dir, '.git'), fs.constants.F_OK, (err) => {
      resolve(!err);
    });
  });
}

async function cloneRepository(appName, repoUrl, branch = 'main') {
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
      return new Promise((resolve, reject) => {
        exec(`cd ${appDir} && git fetch && git checkout ${branch} && git pull origin ${branch}`, (error) => {
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
    return new Promise((resolve, reject) => {
      exec(`git clone -b ${branch} ${repoUrl} ${appDir}`, (error) => {
        if (error) {
          logger.error(`Error cloning repository`, error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    await logger.error(`Error in repository setup`, error);
    throw error;
  }
}

async function pullLatestChanges(appName, branch = 'main') {
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
      exec(`cd ${appDir} && git fetch && git stash && git checkout ${branch} && git pull origin ${branch}`, (error, stdout) => {
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
    await logger.error(`Error in pullLatestChanges`, error);
    throw error;
  }
}

async function getLatestCommit(appName) {
  const appDir = path.join(APPS_DIR, appName);

  return new Promise((resolve, reject) => {
    exec(`cd ${appDir} && git rev-parse HEAD`, (error, stdout) => {
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

module.exports = {
  cloneRepository,
  pullLatestChanges,
  getLatestCommit
}; 