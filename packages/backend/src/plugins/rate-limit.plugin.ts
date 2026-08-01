import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config.js';

export default fp(async (app: FastifyInstance) => {
  const config = getConfig();

  if (config.NODE_ENV === 'production') {
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      keyGenerator: (req) => {
        return req.user?.id ?? req.ip;
      },
    });
  }
});
