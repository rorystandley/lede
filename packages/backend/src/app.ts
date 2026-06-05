import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loadConfig, getConfig } from './config.js';
import errorHandler from './plugins/error-handler.plugin.js';
import authPlugin from './plugins/auth.plugin.js';
import rateLimitPlugin from './plugins/rate-limit.plugin.js';
import metricsPlugin from './plugins/metrics.plugin.js';
import authRoutes from './routes/auth.routes.js';
import feedRoutes from './routes/feeds.routes.js';
import articleRoutes from './routes/articles.routes.js';
import folderRoutes from './routes/folders.routes.js';
import tagRoutes from './routes/tags.routes.js';
import searchRoutes from './routes/search.routes.js';
import opmlRoutes from './routes/opml.routes.js';
import rulesRoutes from './routes/rules.routes.js';
import digestRoutes from './routes/digests.routes.js';
import aiRoutes from './routes/ai.routes.js';
import { registerMcpRoutes } from './mcp/server.js';
import statsRoutes from './routes/stats.routes.js';
import annotationRoutes from './routes/annotations.routes.js';
import sharingRoutes from './routes/sharing.routes.js';
import userRoutes from './routes/user.routes.js';
import discoverRoutes from './routes/discover.routes.js';
import pushRoutes from './routes/push.routes.js';
import { isEmailConfigured } from './lib/email.js';
import { isPushConfigured, initPush } from './lib/push.js';
import { initSentry, captureException } from './lib/sentry.js';

const backendOwnedPrefixes = ['/api', '/mcp', '/metrics'];
const frontendDistPath = join(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');

function getPathname(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] || '/';
  }
}

function isBackendOwnedPath(pathname: string): boolean {
  return backendOwnedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function acceptsHtml(request: FastifyRequest): boolean {
  const accept = request.headers.accept;
  return !accept || accept.includes('text/html');
}

async function registerFrontendRoutes(app: FastifyInstance, isProduction: boolean) {
  const frontendIndexPath = join(frontendDistPath, 'index.html');
  if (!existsSync(frontendIndexPath)) {
    if (isProduction) {
      app.log.warn({ frontendDistPath }, 'Frontend build not found; serving backend routes only');
    }
    return;
  }

  await app.register(fastifyStatic, {
    root: frontendDistPath,
    prefix: '/',
    wildcard: false,
  });

  app.route({
    method: ['GET', 'HEAD'],
    url: '/*',
    schema: { hide: true },
    handler: (request: FastifyRequest, reply: FastifyReply) => {
      const pathname = getPathname(request.url);
      if (isBackendOwnedPath(pathname) || !acceptsHtml(request)) {
        return reply.callNotFound();
      }

      return reply.sendFile('index.html', { maxAge: 0, immutable: false });
    },
  });

  app.log.info({ frontendDistPath }, 'Serving frontend build from backend process');
}

export async function buildApp() {
  loadConfig();
  const config = getConfig();
  initSentry();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(errorHandler);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'lede API',
        version: '0.1.0',
        description: 'A self-hosted news reader with RSS feed management, article reading, and AI-powered digests.',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT or API Key (nrk_...)',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
  });

  await app.register(rateLimitPlugin);
  await app.register(metricsPlugin);
  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(feedRoutes, { prefix: '/api/v1/feeds' });
  await app.register(articleRoutes, { prefix: '/api/v1/articles' });
  await app.register(folderRoutes, { prefix: '/api/v1/folders' });
  await app.register(tagRoutes, { prefix: '/api/v1/tags' });
  await app.register(searchRoutes, { prefix: '/api/v1/search' });
  await app.register(opmlRoutes, { prefix: '/api/v1/opml' });
  await app.register(rulesRoutes, { prefix: '/api/v1/rules' });
  await app.register(digestRoutes, { prefix: '/api/v1/digests' });
  await app.register(aiRoutes, { prefix: '/api/v1/ai' });
  await app.register(statsRoutes, { prefix: '/api/v1/stats' });
  await app.register(annotationRoutes, { prefix: '/api/v1/annotations' });
  await app.register(sharingRoutes, { prefix: '/api/v1/share' });
  await app.register(userRoutes, { prefix: '/api/v1/user' });
  await app.register(discoverRoutes, { prefix: '/api/v1/discover' });
  await app.register(pushRoutes, { prefix: '/api/v1/push' });

  initPush();
  app.get('/api/v1/delivery/capabilities', async () => ({
    email: isEmailConfigured(),
    push: isPushConfigured(),
  }));
  await registerMcpRoutes(app);

  // Basic liveness — is the process responsive?
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/api/health/live', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Readiness — deep checks of dependencies (DB, Redis)
  app.get('/api/health/ready', async (_req, reply) => {
    const { checkHealth } = await import('./lib/health.js');
    const health = await checkHealth();
    const status = health.status === 'unhealthy' ? 503 : 200;
    return reply.status(status).send(health);
  });

  await registerFrontendRoutes(app, config.NODE_ENV === 'production');

  return app;
}
