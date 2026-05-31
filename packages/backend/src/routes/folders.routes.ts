import type { FastifyInstance } from 'fastify';
import { createFolderSchema, updateFolderSchema } from '@news-reader/shared';
import { folderService } from '../services/folder.service.js';

export default async function folderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', {
    schema: { tags: ['Folders'], summary: 'List folders with counts' },
  }, async (req) => {
    return folderService.listForUser(req.user.id);
  });

  app.post('/', {
    schema: { tags: ['Folders'], summary: 'Create a folder' },
  }, async (req, reply) => {
    const body = createFolderSchema.parse(req.body);
    const folder = await folderService.create(req.user.id, body.name, body.parentId);
    return reply.status(201).send(folder);
  });

  app.patch('/:folderId', {
    schema: { tags: ['Folders'], summary: 'Update a folder' },
  }, async (req) => {
    const { folderId } = req.params as { folderId: string };
    const body = updateFolderSchema.parse(req.body);
    return folderService.update(req.user.id, folderId, body);
  });

  app.delete('/:folderId', {
    schema: { tags: ['Folders'], summary: 'Delete a folder' },
  }, async (req, reply) => {
    const { folderId } = req.params as { folderId: string };
    await folderService.delete(req.user.id, folderId);
    return reply.status(204).send();
  });
}
