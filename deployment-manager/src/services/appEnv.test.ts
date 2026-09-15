import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '~/types';

const {
  poolQueryMock,
  fetchAppServiceCredentialsQueryMock,
  ensurePreviewAppStorageMock,
  getMinioEnvVarsMock,
  ensurePortScheduleForProductionAppMock,
  getUmamiEnvVarsForProductionAppMock,
  getBugsinkEnvVarsForProductionAppMock,
  getTestDatabaseEnvVarsForProductionAppMock,
} = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  fetchAppServiceCredentialsQueryMock: vi.fn(),
  ensurePreviewAppStorageMock: vi.fn(),
  getMinioEnvVarsMock: vi.fn(),
  ensurePortScheduleForProductionAppMock: vi.fn(),
  getUmamiEnvVarsForProductionAppMock: vi.fn(),
  getBugsinkEnvVarsForProductionAppMock: vi.fn(),
  getTestDatabaseEnvVarsForProductionAppMock: vi.fn(),
}));

vi.mock('~/services/database', () => ({
  default: { query: poolQueryMock },
}));
vi.mock('~/queries/fetchAppServiceCredentialsQuery', () => ({
  default: fetchAppServiceCredentialsQueryMock,
}));
vi.mock('~/services/minio', () => ({
  ensurePreviewAppStorage: ensurePreviewAppStorageMock,
  getMinioEnvVars: getMinioEnvVarsMock,
}));
vi.mock('~/services/portSchedule', () => ({
  ensurePortScheduleForProductionApp: ensurePortScheduleForProductionAppMock,
}));
vi.mock('~/services/umami', () => ({
  getUmamiEnvVarsForProductionApp: getUmamiEnvVarsForProductionAppMock,
}));
vi.mock('~/services/bugsink', () => ({
  getBugsinkEnvVarsForProductionApp: getBugsinkEnvVarsForProductionAppMock,
}));
vi.mock('~/services/testDatabase', () => ({
  getTestDatabaseEnvVarsForProductionApp: getTestDatabaseEnvVarsForProductionAppMock,
}));

import { getPlatformAppEnvVars } from './appEnv';

const app: App = {
  id: 7,
  name: 'DelayMX',
  repo_url: 'git@github.com:example/delaymx.git',
  branch: 'main',
  domain: 'delaymx.example',
};

function envMap(rows: Array<{ key: string; value: string }>): Record<string, string> {
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
}

describe('getPlatformAppEnvVars MinIO', () => {
  beforeEach(() => {
    poolQueryMock.mockReset().mockResolvedValue({ rows: [] });
    fetchAppServiceCredentialsQueryMock.mockReset();
    ensurePreviewAppStorageMock.mockReset();
    getMinioEnvVarsMock.mockReset().mockImplementation(
      (
        creds: { public_key: string; secret_key: string; bucket?: string },
        appName: string,
        isPreview = false
      ) => ({
        MINIO_HOST: 'minio.test',
        MINIO_ACCESS_KEY: creds.public_key,
        MINIO_SECRET_KEY: creds.secret_key,
        MINIO_BUCKET: creds.bucket || `${appName}${isPreview ? '-preview' : ''}-bucket`,
      })
    );
    ensurePortScheduleForProductionAppMock.mockReset().mockResolvedValue({});
    getUmamiEnvVarsForProductionAppMock.mockReset().mockResolvedValue({});
    getBugsinkEnvVarsForProductionAppMock.mockReset().mockResolvedValue({});
    getTestDatabaseEnvVarsForProductionAppMock.mockReset().mockResolvedValue({});
  });

  it('ensures shared preview MinIO and injects preview bucket vars', async () => {
    ensurePreviewAppStorageMock.mockResolvedValue({
      public_key: 'preview-ak',
      secret_key: 'preview-sk',
      bucket: 'delaymx-preview-bucket',
    });

    const env = envMap(await getPlatformAppEnvVars(app, 'feat/pictures', { isPreview: true }));

    expect(ensurePreviewAppStorageMock).toHaveBeenCalledWith(app);
    expect(fetchAppServiceCredentialsQueryMock).not.toHaveBeenCalled();
    expect(getMinioEnvVarsMock).toHaveBeenCalledWith(
      {
        public_key: 'preview-ak',
        secret_key: 'preview-sk',
        bucket: 'delaymx-preview-bucket',
      },
      'DelayMX',
      true
    );
    expect(env.MINIO_HOST).toBe('minio.test');
    expect(env.MINIO_ACCESS_KEY).toBe('preview-ak');
    expect(env.MINIO_BUCKET).toBe('delaymx-preview-bucket');
    expect(ensurePortScheduleForProductionAppMock).not.toHaveBeenCalled();
  });

  it('omits MINIO_* on preview when object storage is not enabled', async () => {
    ensurePreviewAppStorageMock.mockResolvedValue(null);

    const env = envMap(await getPlatformAppEnvVars(app, 'feat/pictures', { isPreview: true }));

    expect(ensurePreviewAppStorageMock).toHaveBeenCalledWith(app);
    expect(env.MINIO_HOST).toBeUndefined();
    expect(env.MINIO_BUCKET).toBeUndefined();
  });

  it('loads production MinIO without ensuring preview storage', async () => {
    fetchAppServiceCredentialsQueryMock.mockResolvedValue([
      { public_key: 'prod-ak', secret_key: 'prod-sk' },
    ]);

    const env = envMap(await getPlatformAppEnvVars(app, 'main', { isPreview: false }));

    expect(ensurePreviewAppStorageMock).not.toHaveBeenCalled();
    expect(fetchAppServiceCredentialsQueryMock).toHaveBeenCalledWith(7, 'minio', false);
    expect(env.MINIO_ACCESS_KEY).toBe('prod-ak');
    expect(env.MINIO_BUCKET).toBe('delaymx-bucket');
  });
});
