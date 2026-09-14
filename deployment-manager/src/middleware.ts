import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { AUTH_COOKIE_PREFIX } from "~/lib/auth-config";

// Exactly this pathname and exactly POST - GitHub delivers webhooks with no session
// cookie, so this is the ONE route in the app that can never sit behind session auth. Its
// own authentication is the HMAC signature check inside the route handler itself (see
// src/app/api/webhooks/github/route.ts), verified against the configured webhook secret
// before anything else runs. Every other GitHub route (config, per-app connect/discover,
// the install callback) is a normal browser request carrying the operator's session
// cookie and stays behind this middleware exactly as before - this exception is scoped by
// exact pathname AND method so it can never widen to cover them by accident.
function isPublicGithubWebhookRequest(request: NextRequest): boolean {
  return request.nextUrl.pathname === '/api/webhooks/github' && request.method === 'POST';
}

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: AUTH_COOKIE_PREFIX,
  });

  if (
    !sessionCookie &&
    !isPublicGithubWebhookRequest(request) &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/logout') &&
    !request.nextUrl.pathname.startsWith('/api/auth') &&
    !request.nextUrl.pathname.startsWith('/api/health')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
