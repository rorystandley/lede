import type { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema, refreshTokenSchema, createApiKeySchema, forgotPasswordSchema, resetPasswordSchema } from '@lede/shared';
import { authService } from '../services/auth.service.js';

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user',
    },
  }, async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const user = await authService.register(body.email, body.password, body.displayName);
    const accessToken = app.jwt.sign({ id: user.id, email: user.email });
    const refreshToken = await authService.createRefreshToken(user.id);
    return reply.status(201).send({ user, accessToken, refreshToken });
  });

  app.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login with email and password',
    },
  }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await authService.login(body.email, body.password);
    const accessToken = app.jwt.sign({ id: user.id, email: user.email });
    const refreshToken = await authService.createRefreshToken(user.id);
    return reply.send({ user, accessToken, refreshToken });
  });

  app.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token',
    },
  }, async (req, reply) => {
    const body = refreshTokenSchema.parse(req.body);
    const result = await authService.verifyRefreshToken(body.refreshToken);
    if (!result) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const db = (await import('../db/client.js')).getDb();
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, result.userId),
    });
    if (!user) return reply.status(401).send({ error: 'User not found' });

    const accessToken = app.jwt.sign({ id: user.id, email: user.email });
    const refreshToken = await authService.createRefreshToken(user.id);
    return reply.send({ accessToken, refreshToken });
  });

  app.post('/forgot-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Request a password reset email',
    },
  }, async (req, reply) => {
    const body = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(body.email);
    return reply.send({ message: 'If an account exists with that email, a reset link has been sent' });
  });

  app.post('/reset-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Reset password using a reset token',
    },
  }, async (req, reply) => {
    const body = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(body.token, body.password);
    return reply.send({ message: 'Password has been reset' });
  });

  app.post('/api-keys', {
    schema: {
      tags: ['Auth'],
      summary: 'Create an API key',
    },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = createApiKeySchema.parse(req.body);
    const result = await authService.createApiKey(req.user.id, body.name, body.expiresAt);
    return reply.status(201).send({
      id: result.id,
      name: result.name,
      keyPrefix: result.keyPrefix,
      key: result.rawKey,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      createdAt: result.createdAt.toISOString(),
    });
  });

  app.get('/api-keys', {
    schema: {
      tags: ['Auth'],
      summary: 'List API keys',
    },
    preHandler: [app.authenticate],
  }, async (req) => {
    return authService.listApiKeys(req.user.id);
  });

  app.delete('/api-keys/:keyId', {
    schema: {
      tags: ['Auth'],
      summary: 'Delete an API key',
    },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { keyId } = req.params as { keyId: string };
    await authService.deleteApiKey(req.user.id, keyId);
    return reply.status(204).send();
  });
}
