import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  eqMock: vi.fn(),
  whereMock: vi.fn(),
  setMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: mocks.eqMock,
}));

vi.mock('../db/schema/index.js', () => ({
  users: { id: 'users.id' },
}));

vi.mock('../db/client.js', () => ({
  getDb: () => ({
    query: {
      users: {
        findFirst: mocks.findFirstMock,
      },
    },
    update: mocks.updateMock,
  }),
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: userRoutes } = await import('./user.routes.js');
  await app.register(userRoutes, { prefix: '/user' });
  return app;
}

describe('user.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.whereMock.mockResolvedValue(undefined);
    mocks.setMock.mockReturnValue({ where: mocks.whereMock });
    mocks.updateMock.mockReturnValue({ set: mocks.setMock });
  });

  it('returns the current user profile and handles a missing user', async () => {
    const routeEq = vi.fn((left, right) => `${left}:${right}`);
    mocks.findFirstMock.mockImplementationOnce(async ({ where }) => {
      where({ id: 'users.id' }, { eq: routeEq });
      return {
        id: 'user-1',
        email: 'reader@example.com',
        displayName: 'Reader',
        timezone: 'Europe/London',
        digestSchedule: '07:00',
        digestEnabled: true,
        digestEmail: true,
        digestPush: false,
      };
    }).mockImplementationOnce(async ({ where }) => {
      where({ id: 'users.id' }, { eq: routeEq });
      return null;
    });

    const app = await buildApp();

    try {
      const okResponse = await app.inject({ method: 'GET', url: '/user/profile' });
      const missingResponse = await app.inject({ method: 'GET', url: '/user/profile' });

      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({
        id: 'user-1',
        email: 'reader@example.com',
        displayName: 'Reader',
        timezone: 'Europe/London',
        digestSchedule: '07:00',
        digestEnabled: true,
        digestEmail: true,
        digestPush: false,
      });

      expect(missingResponse.statusCode).toBe(200);
      expect(missingResponse.json()).toEqual({ error: 'User not found' });
      expect(routeEq).toHaveBeenCalledWith('users.id', 'user-1');
    } finally {
      await app.close();
    }
  });

  it('updates the current user profile', async () => {
    mocks.eqMock.mockReturnValue('eq-clause');

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'PATCH',
        url: '/user/profile',
        payload: {
          displayName: 'Updated Reader',
          timezone: 'America/New_York',
          digestEnabled: false,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(mocks.updateMock).toHaveBeenCalledWith({ id: 'users.id' });
      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({
        displayName: 'Updated Reader',
        timezone: 'America/New_York',
        digestEnabled: false,
        updatedAt: expect.any(Date),
      }));
      expect(mocks.eqMock).toHaveBeenCalledWith('users.id', 'user-1');
      expect(mocks.whereMock).toHaveBeenCalledWith('eq-clause');
    } finally {
      await app.close();
    }
  });
});
