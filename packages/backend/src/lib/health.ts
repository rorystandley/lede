import { sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { getRedisOpts } from '../queues/index.js';
import IORedis from 'ioredis';

let _healthRedis: IORedis | null = null;

function getHealthRedis(): IORedis {
  if (_healthRedis) return _healthRedis;
  const opts = getRedisOpts();
  _healthRedis = new IORedis({
    host: opts.host,
    port: opts.port,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  return _healthRedis;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  checks: {
    database: { status: 'up' | 'down'; latencyMs?: number; error?: string };
    redis: { status: 'up' | 'down'; latencyMs?: number; error?: string };
  };
  timestamp: string;
  uptime: number;
}

const startTime = Date.now();

export async function checkHealth(): Promise<HealthStatus> {
  const dbCheck = await checkDatabase();
  const redisCheck = await checkRedis();

  let status: HealthStatus['status'] = 'ok';
  if (dbCheck.status === 'down') status = 'unhealthy';
  else if (redisCheck.status === 'down') status = 'degraded';

  return {
    status,
    checks: { database: dbCheck, redis: redisCheck },
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
}

async function checkDatabase(): Promise<HealthStatus['checks']['database']> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'down', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function checkRedis(): Promise<HealthStatus['checks']['redis']> {
  const start = Date.now();
  try {
    const redis = getHealthRedis();
    if (redis.status !== 'ready') await redis.connect();
    const result = await redis.ping();
    if (result !== 'PONG') throw new Error(`Unexpected ping response: ${result}`);
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'down', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
