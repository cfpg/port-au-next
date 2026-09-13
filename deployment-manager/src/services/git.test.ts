import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execFileMock, existsSyncMock, accessMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  existsSyncMock: vi.fn(),
  accessMock: vi.fn((_path: string, _mode: number, cb: (err: Error | null) => void) => cb(null)),
}));

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: Error | null, result?: unknown) => void;
    const callArgs = args.slice(0, -1);
    let result: unknown;
    try {
      result = execFileMock(...callArgs);
    } catch (err) {
      callback(err as Error);
      return;
    }
    callback(null, result ?? { stdout: '', stderr: '' });
  },
}));

vi.mock('fs', () => {
  const mod = {
    existsSync: existsSyncMock,
    mkdirSync: vi.fn(),
    access: accessMock,
    constants: { F_OK: 0 },
    promises: { rm: vi.fn() },
  };
  return { ...mod, default: mod };
});

vi.mock('~/services/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    debug: vi.fn(),
    setDeploymentContext: vi.fn(),
    clearDeploymentContext: vi.fn(),
    setRedactionContext: vi.fn(),
  },
}));

vi.mock('~/utils/getAppsDir', () => ({ default: () => '/apps-test' }));

import { prepareWorkspaceAtCommit, CommitNotFoundError } from './git';

const SECRET_TOKEN = 'super-secret-installation-token';
const AUTH = {
  cloneUrl: 'https://x-access-token@github.com/owner/repo.git',
  askpassPath: '/tmp/port-au-next-git-askpass.sh',
  token: SECRET_TOKEN,
};

function stdoutFor(args: unknown[]): { stdout: string } {
  if (args.includes('rev-parse')) {
    return { stdout: 'abc1234abc1234abc1234abc1234abc1234abcd\n' };
  }
  return { stdout: '' };
}

/** Every argv array ever passed to execFile, across all calls - for "never in argv" checks. */
function allArgvFlat(): unknown[] {
  return execFileMock.mock.calls.flatMap(([, argv]) => (Array.isArray(argv) ? argv : []));
}

function callsContaining(needle: string) {
  return execFileMock.mock.calls.filter(([, argv]) => Array.isArray(argv) && argv.includes(needle));
}

beforeEach(() => {
  execFileMock.mockReset();
  existsSyncMock.mockReset();
  execFileMock.mockImplementation((_file: string, argv: string[]) => stdoutFor(argv));
});

describe('prepareWorkspaceAtCommit - unconnected app (no auth)', () => {
  it('behaves exactly as before: no clone, no remote mutation, no credential env on fetch', async () => {
    existsSyncMock.mockReturnValue(true);

    const { commitSha } = await prepareWorkspaceAtCommit('myapp', 'main', undefined);

    expect(commitSha).toBe('abc1234abc1234abc1234abc1234abc1234abcd');
    expect(callsContaining('clone')).toHaveLength(0);
    expect(callsContaining('set-url')).toHaveLength(0);

    const fetchCall = callsContaining('fetch')[0];
    const fetchOptions = fetchCall[2] as { env?: NodeJS.ProcessEnv } | undefined;
    expect(fetchOptions?.env?.GIT_ASKPASS).toBeUndefined();
    expect(fetchOptions?.env?.GIT_TOKEN).toBeUndefined();
  });

  it('still verifies the requested SHA and rejects with CommitNotFoundError on a mismatch', async () => {
    existsSyncMock.mockReturnValue(true);
    execFileMock.mockImplementation((_file: string, argv: string[]) => {
      if (argv.includes('rev-parse')) return { stdout: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n' };
      return { stdout: '' };
    });

    await expect(
      prepareWorkspaceAtCommit('myapp', 'main', 'cafefeedcafefeedcafefeedcafefeedcafefeed')
    ).rejects.toBeInstanceOf(CommitNotFoundError);
  });
});

describe('prepareWorkspaceAtCommit - GitHub-connected app (auth given)', () => {
  it('performs a deferred initial clone with a credential-free URL and per-subprocess env only', async () => {
    existsSyncMock.mockReturnValue(false); // never cloned yet

    await prepareWorkspaceAtCommit('myapp', 'main', undefined, AUTH);

    const cloneCall = callsContaining('clone')[0];
    expect(cloneCall).toBeDefined();
    const [, cloneArgv, cloneOptions] = cloneCall as [string, string[], { env?: NodeJS.ProcessEnv }];
    expect(cloneArgv).toEqual(['clone', '--branch', 'main', AUTH.cloneUrl, '/apps-test/myapp']);
    expect(cloneOptions.env?.GIT_ASKPASS).toBe(AUTH.askpassPath);
    expect(cloneOptions.env?.GIT_TOKEN).toBe(SECRET_TOKEN);

    // The token must never appear as a literal argv value - only ever via env.
    expect(allArgvFlat()).not.toContain(SECRET_TOKEN);
    expect(cloneArgv.some((arg) => arg.includes(SECRET_TOKEN))).toBe(false);
  });

  it('refreshes origin to the credential-free URL and authenticates only the fetch call', async () => {
    existsSyncMock.mockReturnValue(true); // already cloned previously

    await prepareWorkspaceAtCommit('myapp', 'main', undefined, AUTH);

    expect(callsContaining('clone')).toHaveLength(0); // no re-clone when already present

    const setUrlCall = callsContaining('set-url')[0];
    expect(setUrlCall[1]).toEqual(['-C', '/apps-test/myapp', 'remote', 'set-url', 'origin', AUTH.cloneUrl]);
    // origin is credential-free by construction - no token substring possible, but assert
    // explicitly against the literal argv value used.
    expect(String(setUrlCall[1])).not.toContain(SECRET_TOKEN);

    const fetchCall = callsContaining('fetch')[0];
    const fetchOptions = fetchCall[2] as { env?: NodeJS.ProcessEnv };
    expect(fetchOptions.env?.GIT_ASKPASS).toBe(AUTH.askpassPath);
    expect(fetchOptions.env?.GIT_TOKEN).toBe(SECRET_TOKEN);

    // Local-only operations must not receive the credential env - only the two
    // network-touching calls (clone, fetch) need it.
    for (const localOp of ['stash', 'checkout', 'reset', 'rev-parse']) {
      for (const call of callsContaining(localOp)) {
        const options = call[2] as { env?: NodeJS.ProcessEnv } | undefined;
        expect(options?.env?.GIT_TOKEN).toBeUndefined();
      }
    }

    expect(allArgvFlat()).not.toContain(SECRET_TOKEN);
  });
});
