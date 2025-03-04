const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const APPS_DIR = path.join(__dirname, '../../apps');

async function cloneRepository(appName, repoUrl, branch = 'main') {
  const appDir = path.join(APPS_DIR, appName);

  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }

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