import type { FastifyInstance } from 'fastify';
import { createRuleSchema, updateRuleSchema } from '@lede/shared';
import { ruleService } from '../services/rule.service.js';

export default async function rulesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', {
    schema: { tags: ['Rules'], summary: 'List all rules' },
  }, async (req) => {
    return ruleService.listForUser(req.user.id);
  });

  app.post('/', {
    schema: { tags: ['Rules'], summary: 'Create a rule' },
  }, async (req, reply) => {
    const body = createRuleSchema.parse(req.body);
    const rule = await ruleService.create(req.user.id, body);
    return reply.status(201).send(rule);
  });

  app.patch('/:ruleId', {
    schema: { tags: ['Rules'], summary: 'Update a rule' },
  }, async (req) => {
    const { ruleId } = req.params as { ruleId: string };
    const body = updateRuleSchema.parse(req.body);
    return ruleService.update(req.user.id, ruleId, body);
  });

  app.delete('/:ruleId', {
    schema: { tags: ['Rules'], summary: 'Delete a rule' },
  }, async (req, reply) => {
    const { ruleId } = req.params as { ruleId: string };
    await ruleService.delete(req.user.id, ruleId);
    return reply.status(204).send();
  });
}
