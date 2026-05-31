import type { FastifyInstance } from 'fastify';
import { opmlService } from '../services/opml.service.js';

export default async function opmlRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/import', {
    schema: { tags: ['OPML'], summary: 'Import feeds from OPML' },
  }, async (req, reply) => {
    const body = req.body as { opml: string };
    if (!body.opml || typeof body.opml !== 'string') {
      return reply.status(400).send({ error: 'opml field is required as a string' });
    }
    const result = await opmlService.importOpml(req.user.id, body.opml);
    return result;
  });

  app.get('/export', {
    schema: { tags: ['OPML'], summary: 'Export feeds as OPML' },
  }, async (req, reply) => {
    const opml = await opmlService.exportOpml(req.user.id);
    return reply
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', 'attachment; filename="news-reader-export.opml"')
      .send(opml);
  });
}
