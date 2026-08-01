import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { pushSubscriptions } from '../db/schema/index.js';
import { getVapidPublicKey, isPushConfigured, sendPushToUser } from '../lib/push.js';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  userAgent: z.string().optional(),
});

export default async function pushRoutes(app: FastifyInstance) {
  // Public — anyone can fetch the VAPID public key
  app.get('/vapid-key', {
    schema: { tags: ['Push'], summary: 'Get VAPID public key for web push' },
  }, async () => {
    return { publicKey: getVapidPublicKey(), enabled: isPushConfigured() };
  });

  app.addHook('preHandler', app.authenticate);

  app.post('/subscribe', {
    schema: { tags: ['Push'], summary: 'Register a push subscription' },
  }, async (req, reply) => {
    const body = subscribeSchema.parse(req.body);
    const db = getDb();
    await db.insert(pushSubscriptions).values({
      userId: req.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent ?? null,
    }).onConflictDoNothing();
    return reply.status(201).send({ ok: true });
  });

  app.delete('/subscribe', {
    schema: { tags: ['Push'], summary: 'Remove a push subscription by endpoint' },
  }, async (req, reply) => {
    const body = z.object({ endpoint: z.string().url() }).parse(req.body);
    const db = getDb();
    await db.delete(pushSubscriptions).where(
      and(eq(pushSubscriptions.userId, req.user.id), eq(pushSubscriptions.endpoint, body.endpoint)),
    );
    return reply.status(204).send();
  });

  app.post('/test', {
    schema: { tags: ['Push'], summary: 'Send a test push to verify the subscription' },
  }, async (req) => {
    const sent = await sendPushToUser(req.user.id, {
      title: 'lede',
      body: 'Push notifications are working!',
      tag: 'test',
    });
    return { sent };
  });
}
