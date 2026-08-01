import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  executeMock,
  getDbMock,
  getRedisOptsMock,
  connectMock,
  pingMock,
  RedisMock,
} = vi.hoisted(() => {
  const executeMock = vi.fn();
  const getDbMock = vi.fn(() => ({
    execute: executeMock,
  }));
  const getRedisOptsMock = vi.fn(() => ({ host: 'redis.local', port: 6380 }));
  const connectMock = vi.fn();
  const pingMock = vi.fn();
  const RedisMock = vi.fn().mockImplementation(() => ({
    status: 'wait',
    connect: connectMock,
    ping: pingMock,
  }));

  return {
    executeMock,
    getDbMock,
    getRedisOptsMock,
    connectMock,
    pingMock,
    RedisMock,
  };
});

vi.mock('../db/client.js', () => ({
  getDb: getDbMock,
}));

vi.mock('../queues/index.js', () => ({
  getRedisOpts: getRedisOptsMock,
}));

vi.mock('ioredis', () => ({
  default: RedisMock,
}));

describe('health checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    executeMock.mockResolvedValue(undefined);
    connectMock.mockResolvedValue(undefined);
    pingMock.mockResolvedValue('PONG');
    RedisMock.mockImplementation(() => ({
      status: 'wait',
      connect: connectMock,
      ping: pingMock,
    }));
  });

  it('reports ok when database and redis are up', async () => {
    const { checkHealth } = await import('./health.js');
    const health = await checkHealth();

    expect(health.status).toBe('ok');
    expect(health.checks.database.status).toBe('up');
    expect(health.checks.redis.status).toBe('up');
    expect(health.uptime).toBeGreaterThanOrEqual(0);
    expect(getRedisOptsMock).toHaveBeenCalled();
    expect(RedisMock).toHaveBeenCalledWith({
      host: 'redis.local',
      port: 6380,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  });

  it('reports degraded when redis is down but the database is up', async () => {
    pingMock.mockRejectedValueOnce(new Error('redis down'));

    const { checkHealth } = await import('./health.js');
    const health = await checkHealth();

    expect(health.status).toBe('degraded');
    expect(health.checks.database.status).toBe('up');
    expect(health.checks.redis).toMatchObject({
      status: 'down',
      error: 'redis down',
    });
  });

  it('reports unhealthy when the database is down', async () => {
    executeMock.mockRejectedValueOnce('db failed');

    const { checkHealth } = await import('./health.js');
    const health = await checkHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.checks.database).toMatchObject({
      status: 'down',
      error: 'Unknown error',
    });
  });

  it('skips redis connect when the client is already ready and surfaces bad pong responses', async () => {
    RedisMock.mockImplementation(() => ({
      status: 'ready',
      connect: connectMock,
      ping: pingMock.mockResolvedValueOnce('NOPE'),
    }));

    const { checkHealth } = await import('./health.js');
    const health = await checkHealth();

    expect(connectMock).not.toHaveBeenCalled();
    expect(health.status).toBe('degraded');
    expect(health.checks.redis).toMatchObject({
      status: 'down',
      error: 'Unexpected ping response: NOPE',
    });
  });

  it('reuses the cached redis client between health checks', async () => {
    const { checkHealth } = await import('./health.js');

    await checkHealth();
    await checkHealth();

    expect(RedisMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces database error messages when the thrown value is an Error', async () => {
    executeMock.mockRejectedValueOnce(new Error('db down'));

    const { checkHealth } = await import('./health.js');
    const health = await checkHealth();

    expect(health.checks.database).toMatchObject({
      status: 'down',
      error: 'db down',
    });
  });

  it('reports unknown redis failures when the thrown value is not an Error', async () => {
    pingMock.mockRejectedValueOnce('redis failed');

    const { checkHealth } = await import('./health.js');
    const health = await checkHealth();

    expect(health.checks.redis).toMatchObject({
      status: 'down',
      error: 'Unknown error',
    });
  });
});
