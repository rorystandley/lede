import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { eq, and, gt, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, apiKeys, refreshTokens } from '../db/schema/index.js';
import { getConfig } from '../config.js';
import { API_KEY_PREFIX } from '@lede/shared';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48;

function digestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class AuthService {
  async register(email: string, password: string, displayName?: string) {
    const config = getConfig();
    if (config.REGISTRATION_MODE === 'invite') {
      throw new HttpError(403, 'Registration is invite-only');
    }

    const db = getDb();
    const existing = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });
    if (existing) throw new HttpError(409, 'Email already registered');

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
    if (!user) throw new HttpError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new HttpError(401, 'Invalid credentials');

    return { id: user.id, email: user.email };
  }

  async createRefreshToken(userId: string): Promise<string> {
    const db = getDb();
    const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const tokenDigest = digestToken(token);
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({ userId, tokenDigest, tokenHash, expiresAt });
    return token;
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
    const db = getDb();
    const now = new Date();
    const tokenDigest = digestToken(token);

    await db.delete(refreshTokens).where(lte(refreshTokens.expiresAt, now));

    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(and(
        eq(refreshTokens.tokenDigest, tokenDigest),
        gt(refreshTokens.expiresAt, now)
      ))
      .limit(1);

    if (!row) return null;
    if (await bcrypt.compare(token, row.tokenHash)) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, row.id));
      return { userId: row.userId };
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
