import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '~/types';

const {
  listBucketsMock,
  makeBucketMock,
  setBucketPolicyMock,
  fetchMock,
  insertMock,
  execCommandMock,
} = vi.hoisted(() => {
  process.env.MINIO_ROOT_USER = 'root';
  process.env.MINIO_ROOT_PASSWORD = 'secret';
  process.env.MINIO_HOST = 'minio.test';
  return {
    listBucketsMock: vi.fn(),
    makeBucketMock: vi.fn(),
    setBucketPolicyMock: vi.fn(),
    fetchMock: vi.fn(),
    insertMock: vi.fn(),
    execCommandMock: vi.fn(),
  };
});

vi.mock('minio', () => ({
  Client: class {
    listBuckets = listBucketsMock;
    makeBucket = makeBucketMock;
    setBucketPolicy = setBucketPolicyMock;
  },
}));
vi.mock('~/queries/fetchAppServiceCredentialsQuery', () => ({ default: fetchMock }));
vi.mock('~/queries/insertAppServiceCredentialsQuery', () => ({ default: insertMock }));
vi.mock('~/utils/docker', () => ({ execCommand: execCommandMock }));
vi.mock('~/services/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { ensurePreviewAppStorage, getMinioEnvVars } from './minio';

const app: App = {
  id: 7,
  name: 'DelayMX',
  repo_url: 'git@github.com:example/delaymx.git',
  branch: 'main',
  domain: 'delaymx.example',
};

describe('getMinioEnvVars', () => {
  it('derives the preview bucket when credentials omit bucket', () => {
    const env = getMinioEnvVars({ public_key: 'ak', secret_key: 'sk' }, 'DelayMX', true);
    expect(env.MINIO_HOST).toBe('minio.test');
    expect(env.MINIO_BUCKET).toBe('delaymx-preview-bucket');
  });

  it('derives the production bucket by default', () => {
    const env = getMinioEnvVars({ public_key: 'ak', secret_key: 'sk' }, 'DelayMX');
    expect(env.MINIO_BUCKET).toBe('delaymx-bucket');
  });
});

describe('ensurePreviewAppStorage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    insertMock.mockReset();
    listBucketsMock.mockReset();
    makeBucketMock.mockReset();
    setBucketPolicyMock.mockReset();
    execCommandMock.mockReset().mockResolvedValue('');
    insertMock.mockResolvedValue({ rows: [] });
    makeBucketMock.mockResolvedValue(undefined);
    setBucketPolicyMock.mockResolvedValue(undefined);
  });

  it('does nothing when production object storage is not enabled', async () => {
    fetchMock.mockResolvedValue([]);

    await expect(ensurePreviewAppStorage(app)).resolves.toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
    expect(makeBucketMock).not.toHaveBeenCalled();
  });

  it('reuses an existing preview MinIO row without creating a bucket', async () => {
    fetchMock.mockImplementation(async (_appId: number, _type: string, isPreview: boolean) => {
      if (!isPreview) {
        return [{ public_key: 'prod-ak', secret_key: 'prod-sk' }];
      }
      return [{ public_key: 'preview-ak', secret_key: 'preview-sk' }];
    });

    await expect(ensurePreviewAppStorage(app)).resolves.toEqual({
      public_key: 'preview-ak',
      secret_key: 'preview-sk',
      bucket: 'delaymx-preview-bucket',
    });
    expect(makeBucketMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('creates a shared preview bucket when production storage exists and preview does not', async () => {
    fetchMock.mockImplementation(async (_appId: number, _type: string, isPreview: boolean) => {
      if (!isPreview) {
        return [{ public_key: 'prod-ak', secret_key: 'prod-sk' }];
      }
      return [];
    });
    listBucketsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: 'delaymx-preview-bucket' }]);

    const creds = await ensurePreviewAppStorage(app);

    expect(creds?.bucket).toBe('delaymx-preview-bucket');
    expect(creds?.public_key).toEqual(expect.any(String));
    expect(makeBucketMock).toHaveBeenCalledWith('delaymx-preview-bucket');
    expect(insertMock).toHaveBeenCalledWith(7, 'minio', creds?.public_key, creds?.secret_key, true);
    expect(execCommandMock.mock.calls.some(([cmd]) => String(cmd).includes('delaymx-preview-policy'))).toBe(
      true
    );
  });
});
