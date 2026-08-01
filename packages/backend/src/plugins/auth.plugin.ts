import fp from 'fastify-plugin';
import fjwt from '@fastify/jwt';
import { eq, and, gt } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { apiKeys } from '../db/schema/index.js';
import { getConfig } from '../config.js';
import bcrypt from 'bcrypt';
import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string };
    user: { id: string; email: string };
  }
}

export default fp(async (app: FastifyInstance) => {
  const config = getConfig();

  await app.register(fjwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '1h' },
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw app.httpErrors.unauthorized('Missing authorization header');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw app.httpErrors.unauthorized('Invalid authorization format');
    }

    if (token.startsWith('nrk_')) {
      const db = getDb();
      const prefix = token.slice(0, 8);
      const keys = await db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.keyPrefix, prefix),
            ...([] as ReturnType<typeof gt>[]),
          )
        );

      let matched = false;
      for (const key of keys) {
        if (key.expiresAt && key.expiresAt < new Date()) continue;
        if (await bcrypt.compare(token, key.keyHash)) {
          matched = true;
          await db
            .update(apiKeys)
            .set({ lastUsed: new Date() })
            .where(eq(apiKeys.id, key.id));

          const userRow = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, key.userId),
          });
          if (!userRow) throw app.httpErrors.unauthorized('User not found');
          req.user = { id: userRow.id, email: userRow.email };
          break;
        }
      }

      if (!matched) {
        throw app.httpErrors.unauthorized('Invalid API key');
      }
    } else {
      try {
        await req.jwtVerify();
      } catch {
        throw app.httpErrors.unauthorized('Invalid or expired token');
      }
    }
  });
});
