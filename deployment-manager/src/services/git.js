const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

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
      fs.mkdirSync(appDir, { recursive: true });
    }

    // Check if it's already a git repository
    const isRepo = await isGitRepo(appDir);
    
    if (isRepo) {
      console.log(`Repository already exists at ${appDir}, updating instead...`);
      return new Promise((resolve, reject) => {
        exec(`cd ${appDir} && git fetch && git checkout ${branch} && git pull origin ${branch}`, (error) => {
          if (error) {
            console.error(`Error updating repository: ${error.message}`);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    // If not a repo, clone it
    return new Promise((resolve, reject) => {
      exec(`git clone -b ${branch} ${repoUrl} ${appDir}`, (error) => {
        if (error) {
          console.error(`Error cloning repository: ${error.message}`);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.error(`Error in repository setup: ${error.message}`);
    throw error;
  }
}

async function pullLatestChanges(appName, branch = 'main') {
  const appDir = path.join(APPS_DIR, appName);

  return new Promise((resolve, reject) => {
    exec(`cd ${appDir} && git pull origin ${branch}`, (error, stdout) => {
      if (error) {
        console.error(`Error pulling latest changes: ${error.message}`);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function getLatestCommit(appName) {
  const appDir = path.join(APPS_DIR, appName);

  return new Promise((resolve, reject) => {
    exec(`cd ${appDir} && git rev-parse HEAD`, (error, stdout) => {
      if (error) {
        console.error(`Error getting latest commit: ${error.message}`);
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

module.exports = {
  cloneRepository,
  pullLatestChanges,
  getLatestCommit
}; 