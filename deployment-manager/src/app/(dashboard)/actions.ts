"use server";

import pool from '~/services/database';
import logger from '~/services/logger';
import fetchAppsQuery from '~/queries/fetchAppsQuery';
import fetchRecentDeploymentsQuery from '~/queries/fetchRecentDeploymentsQuery';
import { revalidatePath } from 'next/cache';
import { withAuth } from '~/lib/auth-utils';
import { auth } from '~/lib/auth';
import { headers } from 'next/headers';
import { enqueueManualDeployment } from '~/services/deployQueue';

export const fetchApps = withAuth(async () => {
  const apps = await fetchAppsQuery();
  return apps;
});

export const fetchRecentDeployments = withAuth(async () => {
  const deployments = await fetchRecentDeploymentsQuery();
  return deployments;
});

export const triggerDeployment = withAuth(async (
  appName: string,
  {
    pathname,
    branch,
    confirmConcurrent = false,
  }: { pathname?: string; branch?: string; confirmConcurrent?: boolean } = {}
) => {
  try {
    const appResult = await pool.query('SELECT id, branch FROM apps WHERE name = $1', [appName]);
    if (appResult.rows.length === 0) {
      throw new Error('App not found');
    }
    const app = appResult.rows[0];
    const targetBranch = branch || app.branch;

    const session = await auth.api.getSession({ headers: await headers() });

    const result = await enqueueManualDeployment(
      app.id,
      session?.user?.id,
      targetBranch,
      confirmConcurrent
    );

    if (result.requiresConfirmation) {
      return { success: false, requiresConfirmation: true, branch: targetBranch };
    }

    if (pathname) {
      revalidatePath(pathname);
    }

    return {
      success: true,
      message: 'Deployment queued',
      queueJobId: result.queueJobId,
    };
  } catch (error) {
    await logger.error('Error initiating deployment', error as Error);
    return {
      success: false,
      error: (error as Error).message || 'Deployment failed',
    };
  }
});
