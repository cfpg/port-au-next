const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const APPS_DIR = path.join(__dirname, '../../apps');

// Files that we modify and should be ignored during git operations
const MANAGED_FILES = [
  'next.config.js',
  'next.config.ts',
  '.env',
  'src/lib/image-loader.js',
  'src/lib/image-loader.ts'
];

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

async function execGitCommand(appDir, command) {
  return new Promise((resolve, reject) => {
    exec(`cd ${appDir} && ${command}`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function pullLatestChanges(appName, branch = 'main') {
  const appDir = path.join(APPS_DIR, appName);
  
  try {
    await logger.info('Stashing any local changes', { appName });
    await execGitCommand(appDir, 'git stash');
    
    await logger.info('Pulling latest changes', { appName, branch });
    await execGitCommand(appDir, `git fetch origin ${branch}`);
    await execGitCommand(appDir, `git reset --hard origin/${branch}`);
    await execGitCommand(appDir, 'git clean -fd');
    
    await logger.info('Successfully pulled latest changes');
  } catch (error) {
    await logger.error('Error pulling latest changes', error);
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
  getLatestCommit,
  isGitRepo
}; 