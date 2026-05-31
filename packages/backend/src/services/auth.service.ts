import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, apiKeys, refreshTokens } from '../db/schema/index.js';
import { getConfig } from '../config.js';
import { API_KEY_PREFIX } from '@news-reader/shared';

const SALT_ROUNDS = 12;

export class AuthService {
  async register(email: string, password: string, displayName?: string) {
    const config = getConfig();
    if (config.REGISTRATION_MODE === 'invite') {
      throw new Error('Registration is invite-only');
    }

    const db = getDb();
    const existing = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });
    if (existing) throw new Error('Email already registered');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [user] = await db.insert(users).values({
      email,
      passwordHash,
      displayName: displayName ?? null,
    }).returning();

    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string) {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });
    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    return { id: user.id, email: user.email };
  }

  async createRefreshToken(userId: string): Promise<string> {
    const db = getDb();
    const token = crypto.randomBytes(48).toString('base64url');
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
    return token;
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(refreshTokens)
      .where(and());

    for (const row of rows) {
      if (row.expiresAt < new Date()) continue;
      if (await bcrypt.compare(token, row.tokenHash)) {
        await db.delete(refreshTokens).where(eq(refreshTokens.id, row.id));
        return { userId: row.userId };
      }
    }
    return null;
  }

  async createApiKey(userId: string, name: string, expiresAt?: string) {
    const db = getDb();
    const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    const keyPrefix = rawKey.slice(0, 8);
    const keyHash = await bcrypt.hash(rawKey, SALT_ROUNDS);

    const [apiKey] = await db.insert(apiKeys).values({
      userId,
      name,
      keyHash,
      keyPrefix,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    return { ...apiKey, rawKey };
  }

  async listApiKeys(userId: string) {
    const db = getDb();
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsed: apiKeys.lastUsed,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));
  }

  async deleteApiKey(userId: string, keyId: string) {
    const db = getDb();
    await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
  }
}

export const authService = new AuthService();
