import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { eq, and, gt, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, apiKeys, refreshTokens, passwordResetTokens } from '../db/schema/index.js';
import { getConfig } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { API_KEY_PREFIX } from '@lede/shared';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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

  async requestPasswordReset(email: string): Promise<void> {
    const db = getDb();
    const config = getConfig();
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    });

    // Always return silently to prevent email enumeration
    if (!user) return;

    // Delete any existing reset tokens for this user
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenDigest = digestToken(token);
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await db.insert(passwordResetTokens).values({ userId: user.id, tokenDigest, tokenHash, expiresAt });

    const resetUrl = `${config.APP_URL}/reset-password?token=${token}`;
    await sendEmail(
      user.email,
      'Reset your password',
      `<p>You requested a password reset. Click the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
      `You requested a password reset. Visit this link to set a new password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const db = getDb();
    const now = new Date();
    const tokenDigest = digestToken(token);

    // Clean up expired tokens
    await db.delete(passwordResetTokens).where(lte(passwordResetTokens.expiresAt, now));

    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenDigest, tokenDigest),
        gt(passwordResetTokens.expiresAt, now)
      ))
      .limit(1);

    if (!row) throw new HttpError(400, 'Invalid or expired reset token');

    const valid = await bcrypt.compare(token, row.tokenHash);
    if (!valid) throw new HttpError(400, 'Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, row.userId));

    // Delete all reset tokens for this user
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.userId));

    // Invalidate all refresh tokens so existing sessions are revoked
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, row.userId));
  }
}

export const authService = new AuthService();
