import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getSessionCookieMock } = vi.hoisted(() => ({
  getSessionCookieMock: vi.fn(),
}));

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: getSessionCookieMock,
}));

import { middleware } from './middleware';

function request(pathname: string, method: string = 'GET'): NextRequest {
  return new NextRequest(new URL(`https://example.com${pathname}`), { method });
}

beforeEach(() => {
  getSessionCookieMock.mockReset();
  getSessionCookieMock.mockReturnValue(undefined); // no session cookie, unless a test says otherwise
});

describe('middleware - GitHub webhook exception', () => {
  it('lets an unauthenticated POST to exactly /api/webhooks/github through without a redirect', async () => {
    const result = await middleware(request('/api/webhooks/github', 'POST'));
    expect(result).toBeUndefined(); // no redirect - falls through to the route handler
  });

  it('still redirects an unauthenticated GET to the same pathname (exception is POST-only)', async () => {
    const result = await middleware(request('/api/webhooks/github', 'GET'));
    expect(result?.status).toBe(307);
    expect(result?.headers.get('location')).toContain('/login');
  });

  it('still redirects an unauthenticated POST to a path that only starts with the webhook prefix', async () => {
    // Guards against the exception ever widening past the exact pathname.
    const result = await middleware(request('/api/webhooks/github/extra', 'POST'));
    expect(result?.status).toBe(307);
  });

  it('leaves every other GitHub route behind normal session auth', async () => {
    const protectedGithubRoutes = [
      '/api/github/config',
      '/api/apps/1/github',
      '/api/apps/1/github/connect',
      '/api/apps/1/github/discover',
      '/api/github/installations/callback',
    ];

    for (const pathname of protectedGithubRoutes) {
      const result = await middleware(request(pathname, 'POST'));
      expect(result?.status).toBe(307);
      expect(result?.headers.get('location')).toContain('/login');
    }
  });

  it('does not redirect an authenticated request to a normally-protected GitHub route', async () => {
    getSessionCookieMock.mockReturnValue('a-session-cookie-value');

    const result = await middleware(request('/api/github/config', 'GET'));
    expect(result).toBeUndefined();
  });

  it('still allows the pre-existing allowlisted paths through with no session', async () => {
    for (const pathname of ['/login', '/logout', '/api/auth/session', '/api/health']) {
      const result = await middleware(request(pathname, 'GET'));
      expect(result).toBeUndefined();
    }
  });
});
