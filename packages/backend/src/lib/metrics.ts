import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'newsreader_' });

// HTTP request metrics
export const httpRequestsTotal = new Counter({
  name: 'newsreader_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'newsreader_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Queue metrics
export const queueJobsProcessed = new Counter({
  name: 'newsreader_queue_jobs_processed_total',
  help: 'Total queue jobs processed',
  labelNames: ['queue', 'status'] as const,
  registers: [registry],
});

export const queueJobDuration = new Histogram({
  name: 'newsreader_queue_job_duration_seconds',
  help: 'Queue job processing duration',
  labelNames: ['queue'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [registry],
});

// Business metrics
export const feedsRefreshed = new Counter({
  name: 'newsreader_feeds_refreshed_total',
  help: 'Total feed refreshes',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const articlesIngested = new Counter({
  name: 'newsreader_articles_ingested_total',
  help: 'Total articles ingested from feeds',
  registers: [registry],
});

export const digestsBuilt = new Counter({
  name: 'newsreader_digests_built_total',
  help: 'Total digests built',
  registers: [registry],
});

export const aiCalls = new Counter({
  name: 'newsreader_ai_calls_total',
  help: 'Total AI API calls',
  labelNames: ['provider', 'operation', 'status'] as const,
  registers: [registry],
});

export const aiTokensUsed = new Counter({
  name: 'newsreader_ai_tokens_used_total',
  help: 'Total AI tokens consumed',
  labelNames: ['provider', 'kind'] as const,
  registers: [registry],
});

export const activeUsers = new Gauge({
  name: 'newsreader_active_users',
  help: 'Number of active users (last 24h)',
  registers: [registry],
});
