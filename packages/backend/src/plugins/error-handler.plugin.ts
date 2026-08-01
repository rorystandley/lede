import fp from 'fastify-plugin';
import sensible from '@fastify/sensible';
import type { FastifyError, FastifyInstance } from 'fastify';
import { captureException } from '../lib/sentry.js';

export default fp(async (app: FastifyInstance) => {
  await app.register(sensible);

  app.setErrorHandler((err: FastifyError, req, reply) => {
    // Don't capture 4xx — those are user errors
    if (!err.statusCode || err.statusCode >= 500) {
      captureException(err, {
        method: req.method,
        url: req.url,
        userId: req.user?.id,
      });
      req.log.error({ err }, 'Unhandled error');
    }
    reply.send(err);
  });
});
