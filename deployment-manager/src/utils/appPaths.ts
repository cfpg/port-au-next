import fs from 'fs';
import path from 'path';

import getAppsDir from '~/utils/getAppsDir';

export function normalizeRootPath(rootPath: string | null | undefined): string {
  if (!rootPath) {
    return '';
  }
  return rootPath.trim().replace(/^\/+|\/+$/g, '');
}

export function validateRootPathFormat(rootPath: string): void {
  const normalized = normalizeRootPath(rootPath);
  if (!normalized) {
    return;
  }

  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Project path must be a relative path inside the repository');
  }
}

export function getAppRepoDir(appName: string): string {
  if (appName.includes('/') || appName.includes('..')) {
    throw new Error('Invalid app name');
  }
  return path.join(getAppsDir(), appName);
}

export function getAppProjectDir(appName: string, rootPath?: string | null): string {
  const repoDir = getAppRepoDir(appName);
  const normalized = normalizeRootPath(rootPath);
  if (!normalized) {
    return repoDir;
  }

  const projectDir = path.join(repoDir, normalized);
  if (!projectDir.startsWith(repoDir)) {
    throw new Error('Invalid project path');
  }

  return projectDir;
}

export function assertAppProjectLayout(projectDir: string): void {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const nextConfigTsPath = path.join(projectDir, 'next.config.ts');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at project path (${projectDir})`);
  }

  if (!fs.existsSync(nextConfigTsPath)) {
    throw new Error(`next.config.ts not found at project path (${projectDir})`);
  }
}
