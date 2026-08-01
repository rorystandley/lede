import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registry, httpRequestsTotal, httpRequestDuration } from '../lib/metrics.js';

export default fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (req) => {
    (req as { startTime?: number }).startTime = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const startTime = (req as { startTime?: number }).startTime;
    if (!startTime) return;
    const duration = (Date.now() - startTime) / 1000;
    const route = req.routeOptions?.url ?? req.url.split('?')[0];
    const labels = { method: req.method, route, status: String(reply.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });

  // /metrics endpoint — no auth (firewall it in production)
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
});
