import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users } from '../db/schema/index.js';

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(50).optional(),
  digestSchedule: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  digestEnabled: z.boolean().optional(),
});

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/profile', {
    schema: { tags: ['User'], summary: 'Get current user profile' },
  }, async (req) => {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, req.user.id),
    });
    if (!user) return { error: 'User not found' };
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      digestSchedule: user.digestSchedule,
      digestEnabled: user.digestEnabled,
    };
  });

  app.patch('/profile', {
    schema: { tags: ['User'], summary: 'Update user profile' },
  }, async (req, reply) => {
    const body = updateProfileSchema.parse(req.body);
    const db = getDb();
    await db.update(users).set({ ...body, updatedAt: new Date() }).where(eq(users.id, req.user.id));
    return reply.status(204).send();
  });
}
