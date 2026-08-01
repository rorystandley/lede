import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  loginMock: vi.fn(),
  createRefreshTokenMock: vi.fn(),
  verifyRefreshTokenMock: vi.fn(),
  revokeRefreshTokenMock: vi.fn(),
  createApiKeyMock: vi.fn(),
  listApiKeysMock: vi.fn(),
  deleteApiKeyMock: vi.fn(),
  jwtSignMock: vi.fn(),
  findUserMock: vi.fn(),
}));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    register: mocks.registerMock,
    login: mocks.loginMock,
    createRefreshToken: mocks.createRefreshTokenMock,
    verifyRefreshToken: mocks.verifyRefreshTokenMock,
    revokeRefreshToken: mocks.revokeRefreshTokenMock,
    createApiKey: mocks.createApiKeyMock,
    listApiKeys: mocks.listApiKeysMock,
    deleteApiKey: mocks.deleteApiKeyMock,
  },
}));

vi.mock('../db/client.js', () => ({
  getDb: () => ({
    query: {
      users: {
        findFirst: mocks.findUserMock,
      },
    },
  }),
}));

let authenticatedUser = { id: 'user-auth', email: 'auth@example.com' };

async function buildApp() {
  const app = Fastify();
  await app.register(cookie);
  app.decorate('jwt', { sign: mocks.jwtSignMock } as never);
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: authRoutes } = await import('./auth.routes.js');
  await app.register(authRoutes, { prefix: '/auth' });
  return app;
}

/** Find a Set-Cookie entry by name in a light-my-request response. */
function getCookie(response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>, name: string) {
  const cookies = response.cookies as Array<{ name: string; value: string; httpOnly?: boolean; sameSite?: string; path?: string; maxAge?: number }>;
  return cookies.find((c) => c.name === name);
}

describe('auth.routes', () => {
  beforeEach(() => {
    authenticatedUser = { id: 'user-auth', email: 'auth@example.com' };
    mocks.findUserMock.mockReset();
    mocks.verifyRefreshTokenMock.mockReset();
    mocks.revokeRefreshTokenMock.mockReset();
    mocks.createRefreshTokenMock.mockReset();
  });

  it('registers users, returns the access token, and sets the refresh cookie', async () => {
    mocks.registerMock.mockResolvedValue({ id: 'user-1', email: 'reader@example.com' });
    mocks.jwtSignMock.mockReturnValue('access-token');
    mocks.createRefreshTokenMock.mockResolvedValue('refresh-token');

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'reader@example.com',
          password: 'password123',
          displayName: 'Reader',
        },
      });

      expect(response.statusCode).toBe(201);
      // The refresh token must NOT be in the JSON body — it's cookie-only.
      expect(response.json()).toEqual({
        user: { id: 'user-1', email: 'reader@example.com' },
        accessToken: 'access-token',
      });
      const cookie = getCookie(response, 'refresh_token');
      expect(cookie?.value).toBe('refresh-token');
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('Strict');
      expect(cookie?.path).toBe('/api/v1/auth');
      expect(mocks.registerMock).toHaveBeenCalledWith('reader@example.com', 'password123', 'Reader');
      expect(mocks.jwtSignMock).toHaveBeenCalledWith({ id: 'user-1', email: 'reader@example.com' });
      expect(mocks.createRefreshTokenMock).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('logs users in, returns the access token, and sets the refresh cookie', async () => {
    mocks.loginMock.mockResolvedValue({ id: 'user-2', email: 'member@example.com' });
    mocks.jwtSignMock.mockReturnValue('login-access-token');
    mocks.createRefreshTokenMock.mockResolvedValue('login-refresh-token');

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'member@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: { id: 'user-2', email: 'member@example.com' },
        accessToken: 'login-access-token',
      });
      expect(getCookie(response, 'refresh_token')?.value).toBe('login-refresh-token');
      expect(mocks.loginMock).toHaveBeenCalledWith('member@example.com', 'password123');
      expect(mocks.createRefreshTokenMock).toHaveBeenCalledWith('user-2');
    } finally {
      await app.close();
    }
  });

  it('rejects refresh requests when no refresh cookie is present', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid refresh token' });
      expect(mocks.verifyRefreshTokenMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects refresh requests when the cookie token is invalid and clears the cookie', async () => {
    mocks.verifyRefreshTokenMock.mockResolvedValue(null);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { refresh_token: 'bad-token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid refresh token' });
      expect(mocks.verifyRefreshTokenMock).toHaveBeenCalledWith('bad-token');
      expect(mocks.findUserMock).not.toHaveBeenCalled();
      // Cleared cookie is emitted with an immediate expiry.
      expect(getCookie(response, 'refresh_token')?.value).toBe('');
    } finally {
      await app.close();
    }
  });

  it('rejects refresh requests when the user no longer exists', async () => {
    mocks.verifyRefreshTokenMock.mockResolvedValue({ userId: 'user-missing' });
    mocks.findUserMock.mockResolvedValue(null);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { refresh_token: 'refresh-token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'User not found' });
      expect(mocks.findUserMock).toHaveBeenCalledTimes(1);
      expect(getCookie(response, 'refresh_token')?.value).toBe('');
    } finally {
      await app.close();
    }
  });

  it('rotates the refresh cookie and returns a new access token when the cookie is valid', async () => {
    mocks.verifyRefreshTokenMock.mockResolvedValue({ userId: 'user-3' });
    const routeEq = vi.fn();
    mocks.findUserMock.mockImplementation(async ({ where }) => {
      where({ id: 'users.id' }, { eq: routeEq });
      return { id: 'user-3', email: 'refresh@example.com' };
    });
    mocks.jwtSignMock.mockReturnValue('refreshed-access-token');
    mocks.createRefreshTokenMock.mockResolvedValue('rotated-refresh-token');

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { refresh_token: 'valid-refresh-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ accessToken: 'refreshed-access-token' });
      expect(getCookie(response, 'refresh_token')?.value).toBe('rotated-refresh-token');
      expect(mocks.verifyRefreshTokenMock).toHaveBeenCalledWith('valid-refresh-token');
      expect(mocks.jwtSignMock).toHaveBeenCalledWith({ id: 'user-3', email: 'refresh@example.com' });
      expect(mocks.createRefreshTokenMock).toHaveBeenCalledWith('user-3');
      expect(routeEq).toHaveBeenCalledWith('users.id', 'user-3');
    } finally {
      await app.close();
    }
  });

  it('revokes the refresh token and clears the cookie on logout', async () => {
    mocks.revokeRefreshTokenMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { refresh_token: 'session-token' },
      });

      expect(response.statusCode).toBe(204);
      expect(mocks.revokeRefreshTokenMock).toHaveBeenCalledWith('session-token');
      expect(getCookie(response, 'refresh_token')?.value).toBe('');
    } finally {
      await app.close();
    }
  });

  it('logs out cleanly even without a refresh cookie', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
      });

      expect(response.statusCode).toBe(204);
      expect(mocks.revokeRefreshTokenMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('creates API keys for the authenticated user and serializes dates', async () => {
    mocks.createApiKeyMock.mockResolvedValue({
      id: 'key-1',
      name: 'Integration',
      keyPrefix: 'nrk_abcd',
      rawKey: 'nrk_secret_key',
      expiresAt: new Date('2026-06-10T12:00:00.000Z'),
      createdAt: new Date('2026-06-05T10:00:00.000Z'),
    });

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/api-keys',
        payload: {
          name: 'Integration',
          expiresAt: '2026-06-10T12:00:00.000Z',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        id: 'key-1',
        name: 'Integration',
        keyPrefix: 'nrk_abcd',
        key: 'nrk_secret_key',
        expiresAt: '2026-06-10T12:00:00.000Z',
        createdAt: '2026-06-05T10:00:00.000Z',
      });
      expect(mocks.createApiKeyMock).toHaveBeenCalledWith(
        'user-auth',
        'Integration',
        '2026-06-10T12:00:00.000Z'
      );
    } finally {
      await app.close();
    }
  });

  it('serializes nullable api-key expiry values', async () => {
    mocks.createApiKeyMock.mockResolvedValue({
      id: 'key-2',
      name: 'Local',
      keyPrefix: 'nrk_wxyz',
      rawKey: 'nrk_local_key',
      expiresAt: null,
      createdAt: new Date('2026-06-05T12:00:00.000Z'),
    });

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/api-keys',
        payload: {
          name: 'Local',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        id: 'key-2',
        name: 'Local',
        keyPrefix: 'nrk_wxyz',
        key: 'nrk_local_key',
        expiresAt: null,
        createdAt: '2026-06-05T12:00:00.000Z',
      });
      expect(mocks.createApiKeyMock).toHaveBeenCalledWith('user-auth', 'Local', undefined);
    } finally {
      await app.close();
    }
  });

  it('lists and deletes API keys for the authenticated user', async () => {
    authenticatedUser = { id: 'user-list', email: 'list@example.com' };
    mocks.listApiKeysMock.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Primary',
        keyPrefix: 'nrk_abcd',
        lastUsed: null,
        expiresAt: null,
        createdAt: '2026-06-05T11:00:00.000Z',
      },
    ]);

    const app = await buildApp();

    try {
      const listResponse = await app.inject({
        method: 'GET',
        url: '/auth/api-keys',
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/auth/api-keys/key-1',
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual([
        {
          id: 'key-1',
          name: 'Primary',
          keyPrefix: 'nrk_abcd',
          lastUsed: null,
          expiresAt: null,
          createdAt: '2026-06-05T11:00:00.000Z',
        },
      ]);
      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.listApiKeysMock).toHaveBeenCalledWith('user-list');
      expect(mocks.deleteApiKeyMock).toHaveBeenCalledWith('user-list', 'key-1');
    } finally {
      await app.close();
    }
  });
});
