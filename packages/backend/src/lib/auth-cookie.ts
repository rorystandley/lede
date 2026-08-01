import '@fastify/cookie';
import type { FastifyReply } from 'fastify';

/**
 * Name of the cookie holding the opaque refresh token. Kept `HttpOnly` so that
 * injected JavaScript (XSS) can never read it, unlike the short-lived access
 * token which the SPA holds in memory.
 */
export const REFRESH_COOKIE = 'refresh_token';

// Scope the cookie to the auth routes only — the browser sends it to
// /api/v1/auth/{refresh,logout} and nowhere else, minimising its exposure.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

// Matches the 7-day refresh token lifetime in AuthService.createRefreshToken.
const REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function baseCookieOptions() {
  return {
    httpOnly: true,
    // Only require HTTPS in production; dev/tests run over plain http.
    secure: process.env.NODE_ENV === 'production',
    // Strict is safe here because the SPA is served same-origin with the API,
    // so the refresh/logout XHRs are same-site. It also blocks the cookie from
    // riding along on cross-site requests, which is our CSRF defence.
    sameSite: 'strict' as const,
    path: REFRESH_COOKIE_PATH,
  };
}

/** Persist the refresh token in an HttpOnly, SameSite=Strict cookie. */
export function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

/** Clear the refresh cookie (logout, or when a presented token is rejected). */
export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, baseCookieOptions());
}
