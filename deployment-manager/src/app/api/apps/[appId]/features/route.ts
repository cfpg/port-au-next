import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import pool from '~/services/database';
import { grantCreateDb, revokeCreateDb } from '~/services/database';
import { AppFeature } from '~/types/appFeatures';
import { syncPreviewWildcardRoute } from '~/services/cloudflareRoutes';
import { findGithubInstallationForApp } from '~/queries/githubInstallationsQuery';
import { normalizeGithubRepoFullName } from '~/utils/githubRepoMatch';

export const GET = withAuth(async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam);

  if (isNaN(appId)) {
    return NextResponse.json(
      { error: 'Invalid app ID' },
      { status: 400 }
    );
  }

  try {
    const result = await pool.query(`
      SELECT feature, enabled, config
      FROM app_features
      WHERE app_id = $1
    `, [appId]);

    const features = result.rows.reduce((acc, row) => {
      acc[row.feature] = {
        enabled: row.enabled,
        config: row.config
      };
      return acc;
    }, {} as Record<string, { enabled: boolean; config: any }>);

    return NextResponse.json(features);
  } catch (error) {
    console.error('Error fetching app features:', error);
    return NextResponse.json(
      { error: 'Failed to fetch app features' },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam);

  if (isNaN(appId)) {
    return NextResponse.json(
      { error: 'Invalid app ID' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { feature, enabled, config } = body;

    if (!feature || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Validate feature name
    if (!Object.values(AppFeature).includes(feature as AppFeature)) {
      return NextResponse.json(
        { error: 'Invalid feature' },
        { status: 400 }
      );
    }

    const existing = await pool.query(
      `SELECT config FROM app_features WHERE app_id = $1 AND feature = $2`,
      [appId, feature]
    );
    const existingConfig = existing.rows[0]?.config ?? {};
    let mergedConfig =
      config !== undefined
        ? { ...existingConfig, ...config }
        : { ...existingConfig };

    if (feature === AppFeature.USES_PRISMA && !enabled) {
      mergedConfig = { ...mergedConfig, auto_migrate: false };
    }

    // Turning Auto-deploy OFF is always allowed (it only stops NEW webhook pushes from
    // being enqueued - jobs already accepted keep running, and manual Deploy is
    // unaffected). Turning it ON requires a GitHub connection that actually matches this
    // app's current repository - without this check, enabling it on a disconnected app,
    // or one whose repo_url has since diverged from its connection, would look like it
    // worked but every push would just fail at execution time instead.
    if (feature === AppFeature.AUTO_DEPLOY && enabled) {
      const installation = await findGithubInstallationForApp(appId);
      if (!installation) {
        return NextResponse.json(
          { error: 'Connect this app to a GitHub repository before enabling Auto-deploy.' },
          { status: 400 }
        );
      }

      const appResult = await pool.query<{ repo_url: string }>('SELECT repo_url FROM apps WHERE id = $1', [appId]);
      const repoUrl = appResult.rows[0]?.repo_url;
      const normalizedRepoUrl = repoUrl ? normalizeGithubRepoFullName(repoUrl) : null;
      if (!normalizedRepoUrl || normalizedRepoUrl !== installation.repo_full_name.toLowerCase()) {
        return NextResponse.json(
          {
            error:
              "This app's repository has changed since GitHub was connected. Disconnect and reconnect " +
              'GitHub for the current repository before enabling Auto-deploy.',
          },
          { status: 400 }
        );
      }
    }

    await pool.query(
      `
      INSERT INTO app_features (app_id, feature, enabled, config)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (app_id, feature)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        config = EXCLUDED.config,
        updated_at = CURRENT_TIMESTAMP
    `,
      [appId, feature, enabled, mergedConfig]
    );

    // Grant or revoke CREATEDB when the uses_prisma feature is toggled
    if (feature === AppFeature.USES_PRISMA) {
      const appResult = await pool.query(
        'SELECT db_user FROM apps WHERE id = $1',
        [appId]
      );
      const dbUser = appResult.rows[0]?.db_user;
      if (dbUser) {
        if (enabled) {
          await grantCreateDb(dbUser);
        } else {
          await revokeCreateDb(dbUser);
        }
      }
    }

    if (feature === AppFeature.PREVIEW_BRANCHES) {
      const appResult = await pool.query<{ preview_domain: string | null }>(
        'SELECT preview_domain FROM apps WHERE id = $1',
        [appId]
      );
      const previewDomain = appResult.rows[0]?.preview_domain;
      if (enabled && previewDomain) {
        const routeResult = await syncPreviewWildcardRoute(appId, previewDomain);
        if (!routeResult.success && routeResult.error) {
          return NextResponse.json({ error: routeResult.error }, { status: 400 });
        }
      } else if (!enabled && previewDomain) {
        await syncPreviewWildcardRoute(appId, null, previewDomain);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating app feature:', error);
    return NextResponse.json(
      { error: 'Failed to update app feature' },
      { status: 500 }
    );
  }
}); 