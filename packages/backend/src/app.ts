import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadConfig, getConfig } from './config.js';
import errorHandler from './plugins/error-handler.plugin.js';
import authPlugin from './plugins/auth.plugin.js';
import rateLimitPlugin from './plugins/rate-limit.plugin.js';
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

export async function buildApp() {
  loadConfig();
  const config = getConfig();

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
        title: 'News Reader API',
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
  await registerMcpRoutes(app);

  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}
