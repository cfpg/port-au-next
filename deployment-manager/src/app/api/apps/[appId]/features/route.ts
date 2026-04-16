import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import pool from '~/services/database';
import { grantCreateDb, revokeCreateDb } from '~/services/database';
import { AppFeature } from '~/types/appFeatures';

export const GET = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
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

export const PATCH = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  const appId = parseInt(params.appId);

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

    await pool.query(`
      INSERT INTO app_features (app_id, feature, enabled, config)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (app_id, feature)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        config = EXCLUDED.config,
        updated_at = CURRENT_TIMESTAMP
    `, [appId, feature, enabled, config || {}]);

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating app feature:', error);
    return NextResponse.json(
      { error: 'Failed to update app feature' },
      { status: 500 }
    );
  }
}); 