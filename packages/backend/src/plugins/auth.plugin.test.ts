import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  selectWhereMock: vi.fn(),
  updateMock: vi.fn(),
  setMock: vi.fn(),
  updateWhereMock: vi.fn(),
  findUserMock: vi.fn(),
  bcryptCompareMock: vi.fn(),
}));

vi.mock('../config.js', () => ({
  getConfig: () => ({
    JWT_SECRET: 'test-jwt-secret',
  }),
}));

vi.mock('../db/client.js', () => ({
  getDb: mocks.getDbMock,
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: mocks.bcryptCompareMock,
  },
}));

async function buildApp() {
  const app = Fastify();
  await app.register(sensible);

  const { default: authPlugin } = await import('./auth.plugin.js');
  await app.register(authPlugin);

  app.get('/protected', { preHandler: [app.authenticate] }, async (req) => {
    return (req as typeof req & { user: { id: string; email: string } }).user;
  });

  return app;
}

describe('auth.plugin', () => {
  beforeEach(() => {
    mocks.selectMock.mockImplementation(() => ({ from: mocks.fromMock }));
    mocks.fromMock.mockImplementation(() => ({ where: mocks.selectWhereMock }));
    mocks.updateMock.mockImplementation(() => ({ set: mocks.setMock }));
    mocks.setMock.mockImplementation(() => ({ where: mocks.updateWhereMock }));
    mocks.getDbMock.mockReturnValue({
      select: mocks.selectMock,
      update: mocks.updateMock,
      query: {
        users: {
          findFirst: mocks.findUserMock,
        },
      },
    });
  });

  it('rejects requests that are missing an authorization header', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Missing authorization header');
    } finally {
      await app.close();
    }
  });

  it('rejects requests with an invalid authorization format', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Basic abc123',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid authorization format');
    } finally {
      await app.close();
    }
  });

  it('accepts valid JWT bearer tokens', async () => {
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ id: 'jwt-user', email: 'jwt@example.com' });
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: 'jwt-user',
        email: 'jwt@example.com',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid JWT bearer tokens', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer not-a-real-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid or expired token');
    } finally {
      await app.close();
    }
  });

  it('rejects API keys that do not match any stored key hash', async () => {
    mocks.selectWhereMock.mockResolvedValue([
      {
        id: 'key-1',
        userId: 'user-1',
        keyHash: 'stored-hash',
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
      },
    ]);
    mocks.bcryptCompareMock.mockResolvedValue(false);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer nrk_invalid_key_material',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid API key');
      expect(mocks.bcryptCompareMock).toHaveBeenCalledWith(
        'nrk_invalid_key_material',
        'stored-hash'
      );
    } finally {
      await app.close();
    }
  });

  it('skips expired API keys before checking hashes', async () => {
    mocks.selectWhereMock.mockResolvedValue([
      {
        id: 'key-expired',
        userId: 'user-1',
        keyHash: 'expired-hash',
        expiresAt: new Date('2026-06-04T00:00:00.000Z'),
      },
    ]);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer nrk_expired_key_material',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid API key');
      expect(mocks.bcryptCompareMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('authenticates matching API keys and records the last-used timestamp', async () => {
    const routeEq = vi.fn((left, right) => `${left}:${right}`);
    mocks.selectWhereMock.mockResolvedValue([
      {
        id: 'key-2',
        userId: 'user-2',
        keyHash: 'matching-hash',
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
      },
    ]);
    mocks.bcryptCompareMock.mockResolvedValue(true);
    mocks.findUserMock.mockImplementation(async ({ where }: {
      where: (u: { id: string }, ops: { eq: typeof routeEq }) => string;
    }) => {
      where({ id: 'users.id' }, { eq: routeEq });
      return { id: 'user-2', email: 'api@example.com' };
    });
    mocks.updateWhereMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer nrk_live_key_material',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: 'user-2',
        email: 'api@example.com',
      });
      expect(mocks.updateMock).toHaveBeenCalled();
      expect(mocks.setMock).toHaveBeenCalledWith({
        lastUsed: expect.any(Date),
      });
      expect(mocks.findUserMock).toHaveBeenCalledTimes(1);
      expect(routeEq).toHaveBeenCalledWith('users.id', 'user-2');
    } finally {
      await app.close();
    }
  });

  it('rejects matching API keys when the backing user has been deleted', async () => {
    mocks.selectWhereMock.mockResolvedValue([
      {
        id: 'key-3',
        userId: 'user-3',
        keyHash: 'matching-hash',
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
      },
    ]);
    mocks.bcryptCompareMock.mockResolvedValue(true);
    mocks.findUserMock.mockResolvedValue(null);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer nrk_orphaned_key_material',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('User not found');
    } finally {
      await app.close();
    }
  });
});
