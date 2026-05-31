import fp from 'fastify-plugin';
import sensible from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';

export default fp(async (app: FastifyInstance) => {
  await app.register(sensible);
});
