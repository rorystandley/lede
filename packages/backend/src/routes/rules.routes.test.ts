import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listForUserMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('../services/rule.service.js', () => ({
  ruleService: {
    listForUser: mocks.listForUserMock,
    create: mocks.createMock,
    update: mocks.updateMock,
    delete: mocks.deleteMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: rulesRoutes } = await import('./rules.routes.js');
  await app.register(rulesRoutes, { prefix: '/rules' });
  return app;
}

describe('rules.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists and creates rules', async () => {
    mocks.listForUserMock.mockResolvedValue([{ id: 'rule-1', name: 'AI rule' }]);
    mocks.createMock.mockResolvedValue({ id: 'rule-2', name: 'Star AI' });

    const app = await buildApp();

    try {
      const listResponse = await app.inject({ method: 'GET', url: '/rules' });
      const createResponse = await app.inject({
        method: 'POST',
        url: '/rules',
        payload: {
          name: 'Star AI',
          conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
          actions: [{ type: 'star' }],
          matchMode: 'all',
          priority: 1,
        },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual([{ id: 'rule-1', name: 'AI rule' }]);
      expect(mocks.listForUserMock).toHaveBeenCalledWith('user-1');

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json()).toEqual({ id: 'rule-2', name: 'Star AI' });
      expect(mocks.createMock).toHaveBeenCalledWith('user-1', {
        name: 'Star AI',
        conditions: [{ field: 'title', op: 'contains', value: 'AI' }],
        actions: [{ type: 'star' }],
        matchMode: 'all',
        priority: 1,
      });
    } finally {
      await app.close();
    }
  });

  it('updates and deletes rules', async () => {
    mocks.updateMock.mockResolvedValue({ id: 'rule-1', enabled: false });
    mocks.deleteMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: '/rules/rule-1',
        payload: { enabled: false, priority: 2 },
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/rules/rule-1',
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({ id: 'rule-1', enabled: false });
      expect(mocks.updateMock).toHaveBeenCalledWith('user-1', 'rule-1', { enabled: false, priority: 2 });

      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.deleteMock).toHaveBeenCalledWith('user-1', 'rule-1');
    } finally {
      await app.close();
    }
  });
});
