import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client.js';
import { getConfig } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { API_KEY_PREFIX } from '@lede/shared';
import { authService } from './auth.service.js';

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../lib/email.js', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

const mockBcryptHash = bcrypt.hash as unknown as ReturnType<typeof vi.fn<(data: string, rounds: number) => Promise<string>>>;
const mockBcryptCompare = bcrypt.compare as unknown as ReturnType<typeof vi.fn<(data: string, encrypted: string) => Promise<boolean>>>;

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({ REGISTRATION_MODE: 'open' } as never);
  });

  it('rejects invite-only registration and duplicate emails', async () => {
    vi.mocked(getConfig).mockReturnValue({ REGISTRATION_MODE: 'invite' } as never);

    await expect(authService.register('user@example.com', 'secret')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Registration is invite-only',
    });

    vi.mocked(getConfig).mockReturnValue({ REGISTRATION_MODE: 'open' } as never);
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({ id: 'user-1' }),
        },
      },
    } as never);

    await expect(authService.register('user@example.com', 'secret')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Email already registered',
    });
  });

  it('registers a new user with a hashed password', async () => {
    const routeEq = vi.fn();
    mockBcryptHash.mockResolvedValue('hashed-password');
    const returning = vi.fn().mockResolvedValue([
      {
        id: 'user-1',
        email: 'user@example.com',
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            where({ email: 'users.email' }, { eq: routeEq });
            return null;
          }),
        },
      },
      insert: vi.fn(() => ({ values })),
    } as never);

    await expect(
      authService.register('user@example.com', 'secret', 'Rory'),
    ).resolves.toEqual({ id: 'user-1', email: 'user@example.com' });

    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 12);
    expect(values).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      displayName: 'Rory',
    });
    expect(routeEq).toHaveBeenCalledWith('users.email', 'user@example.com');
  });

  it('normalizes missing display names to null during registration', async () => {
    mockBcryptHash.mockResolvedValue('hashed-password');
    const returning = vi.fn().mockResolvedValue([
      {
        id: 'user-2',
        email: 'another@example.com',
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn(() => ({ values })),
    } as never);

    await expect(
      authService.register('another@example.com', 'secret'),
    ).resolves.toEqual({ id: 'user-2', email: 'another@example.com' });

    expect(values).toHaveBeenCalledWith({
      email: 'another@example.com',
      passwordHash: 'hashed-password',
      displayName: null,
    });
  });

  it('rejects invalid login attempts and returns basic user data on success', async () => {
    const routeEq = vi.fn();
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async ({ where }) => {
        where({ email: 'users.email' }, { eq: routeEq });
        return { id: 'user-1', email: 'user@example.com', passwordHash: 'stored-hash' };
      })
      .mockImplementationOnce(async ({ where }) => {
        where({ email: 'users.email' }, { eq: routeEq });
        return { id: 'user-1', email: 'user@example.com', passwordHash: 'stored-hash' };
      });

    vi.mocked(getDb).mockReturnValue({
      query: {
        users: {
          findFirst,
        },
      },
    } as never);

    await expect(authService.login('user@example.com', 'secret')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });

    mockBcryptCompare.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(authService.login('user@example.com', 'wrong')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });

    await expect(authService.login('user@example.com', 'secret')).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
    expect(bcrypt.compare).toHaveBeenCalledWith('wrong', 'stored-hash');
    expect(bcrypt.compare).toHaveBeenCalledWith('secret', 'stored-hash');
    expect(routeEq).toHaveBeenCalledWith('users.email', 'user@example.com');
  });

  it('creates refresh tokens with a digest and bcrypt hash', async () => {
    (vi.spyOn(crypto, 'randomBytes') as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('x'.repeat(48)));
    mockBcryptHash.mockResolvedValue('hashed-token');

    const insertValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    const token = await authService.createRefreshToken('user-1');

    expect(token).toBe(Buffer.from('x'.repeat(48)).toString('base64url'));
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        tokenHash: 'hashed-token',
        tokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );
  });

  it('returns null when no refresh token matches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const selectLimit = vi.fn().mockResolvedValue([]);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn(() => ({ where: deleteWhere })),
      select: vi.fn(() => ({ from: selectFrom })),
    } as never);

    await expect(authService.verifyRefreshToken('missing-token')).resolves.toBeNull();
    expect(deleteWhere).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('verifies matching refresh tokens and deletes the consumed row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    mockBcryptCompare.mockResolvedValue(true);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteWhereSecond = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn()
      .mockReturnValueOnce({ where: deleteWhere })
      .mockReturnValueOnce({ where: deleteWhereSecond });
    const selectLimit = vi.fn().mockResolvedValue([{ id: 'rt-1', userId: 'user-1', tokenHash: 'hashed-token' }]);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(getDb).mockReturnValue({
      delete: deleteMock,
      select: vi.fn(() => ({ from: selectFrom })),
    } as never);

    await expect(authService.verifyRefreshToken('valid-token')).resolves.toEqual({ userId: 'user-1' });
    expect(bcrypt.compare).toHaveBeenCalledWith('valid-token', 'hashed-token');
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(deleteWhereSecond).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('returns null when bcrypt comparison fails after a digest match', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    mockBcryptCompare.mockResolvedValue(false);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const selectLimit = vi.fn().mockResolvedValue([{ id: 'rt-1', userId: 'user-1', tokenHash: 'hashed-token' }]);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn(() => ({ where: deleteWhere })),
      select: vi.fn(() => ({ from: selectFrom })),
    } as never);

    await expect(authService.verifyRefreshToken('bad-token')).resolves.toBeNull();
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('revokes a refresh token by digest', async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn(() => ({ where: deleteWhere })),
    } as never);

    await expect(authService.revokeRefreshToken('session-token')).resolves.toBeUndefined();
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('creates api keys, lists them, and deletes them', async () => {
    (vi.spyOn(crypto, 'randomBytes') as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('k'.repeat(32)));
    mockBcryptHash.mockResolvedValue('hashed-api-key');

    const createdAt = new Date('2026-06-06T12:00:00.000Z');
    const insertReturning = vi.fn().mockResolvedValue([
      {
        id: 'key-1',
        userId: 'user-1',
        name: 'CLI',
        keyHash: 'hashed-api-key',
        keyPrefix: `${API_KEY_PREFIX}a`,
        expiresAt: new Date('2026-06-07T00:00:00.000Z'),
        createdAt,
      },
    ]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const listWhere = vi.fn().mockResolvedValue([
      {
        id: 'key-1',
        name: 'CLI',
        keyPrefix: `${API_KEY_PREFIX}a`,
        lastUsed: null,
        expiresAt: null,
        createdAt,
      },
    ]);
    const listFrom = vi.fn(() => ({ where: listWhere }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({ from: listFrom })),
      delete: vi.fn(() => ({ where: deleteWhere })),
    } as never);

    const apiKey = await authService.createApiKey('user-1', 'CLI', '2026-06-07T00:00:00.000Z');
    expect(apiKey).toMatchObject({
      id: 'key-1',
      userId: 'user-1',
      name: 'CLI',
      keyHash: 'hashed-api-key',
      keyPrefix: `${API_KEY_PREFIX}a`,
      rawKey: expect.stringMatching(new RegExp(`^${API_KEY_PREFIX}`)),
    });
    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'CLI',
      keyHash: 'hashed-api-key',
      keyPrefix: apiKey.rawKey.slice(0, 8),
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
    });

    await expect(authService.listApiKeys('user-1')).resolves.toEqual([
      {
        id: 'key-1',
        name: 'CLI',
        keyPrefix: `${API_KEY_PREFIX}a`,
        lastUsed: null,
        expiresAt: null,
        createdAt,
      },
    ]);

    await expect(authService.deleteApiKey('user-1', 'key-1')).resolves.toBeUndefined();
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('stores api keys without an expiry when none is provided', async () => {
    (vi.spyOn(crypto, 'randomBytes') as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('z'.repeat(32)));
    mockBcryptHash.mockResolvedValue('hashed-api-key');

    const insertReturning = vi.fn().mockResolvedValue([
      {
        id: 'key-2',
        userId: 'user-1',
        name: 'No Expiry',
        keyHash: 'hashed-api-key',
        keyPrefix: `${API_KEY_PREFIX}n`,
        expiresAt: null,
        createdAt: new Date('2026-06-06T12:00:00.000Z'),
      },
    ]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn(() => ({ values: insertValues })),
    } as never);

    await expect(authService.createApiKey('user-1', 'No Expiry')).resolves.toMatchObject({
      id: 'key-2',
      name: 'No Expiry',
      expiresAt: null,
    });

    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'No Expiry',
      keyHash: 'hashed-api-key',
      keyPrefix: expect.stringMatching(new RegExp(`^${API_KEY_PREFIX}`)),
      expiresAt: null,
    });
  });

  describe('requestPasswordReset', () => {
    it('silently returns when no user matches the email', async () => {
      vi.mocked(getConfig).mockReturnValue({ APP_URL: 'http://localhost:5173' } as never);
      vi.mocked(getDb).mockReturnValue({
        query: {
          users: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      } as never);

      await expect(authService.requestPasswordReset('unknown@example.com')).resolves.toBeUndefined();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('generates a reset token, stores it, and sends an email', async () => {
      (vi.spyOn(crypto, 'randomBytes') as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('r'.repeat(32)));
      mockBcryptHash.mockResolvedValue('hashed-reset-token');
      vi.mocked(sendEmail).mockResolvedValue(true);
      vi.mocked(getConfig).mockReturnValue({ APP_URL: 'http://localhost:5173' } as never);

      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      const insertValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(getDb).mockReturnValue({
        query: {
          users: {
            findFirst: vi.fn().mockResolvedValue({ id: 'user-1', email: 'user@example.com' }),
          },
        },
        delete: vi.fn(() => ({ where: deleteWhere })),
        insert: vi.fn(() => ({ values: insertValues })),
      } as never);

      await authService.requestPasswordReset('user@example.com');

      expect(deleteWhere).toHaveBeenCalled();
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tokenHash: 'hashed-reset-token',
          tokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        }),
      );

      const expectedToken = Buffer.from('r'.repeat(32)).toString('base64url');
      expect(sendEmail).toHaveBeenCalledWith(
        'user@example.com',
        'Reset your password',
        expect.stringContaining(`http://localhost:5173/reset-password?token=${expectedToken}`),
        expect.stringContaining(`http://localhost:5173/reset-password?token=${expectedToken}`),
      );
    });
  });

  describe('resetPassword', () => {
    it('throws when no matching token exists', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));

      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      const selectLimit = vi.fn().mockResolvedValue([]);
      const selectWhere = vi.fn(() => ({ limit: selectLimit }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      vi.mocked(getDb).mockReturnValue({
        delete: vi.fn(() => ({ where: deleteWhere })),
        select: vi.fn(() => ({ from: selectFrom })),
      } as never);

      await expect(authService.resetPassword('bad-token', 'newpassword123')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid or expired reset token',
      });
      vi.useRealTimers();
    });

    it('throws when bcrypt comparison fails for a digest-matched token', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
      mockBcryptCompare.mockResolvedValue(false);

      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      const selectLimit = vi.fn().mockResolvedValue([{ id: 'prt-1', userId: 'user-1', tokenHash: 'hashed-token' }]);
      const selectWhere = vi.fn(() => ({ limit: selectLimit }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      vi.mocked(getDb).mockReturnValue({
        delete: vi.fn(() => ({ where: deleteWhere })),
        select: vi.fn(() => ({ from: selectFrom })),
      } as never);

      await expect(authService.resetPassword('tampered-token', 'newpassword123')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid or expired reset token',
      });
      vi.useRealTimers();
    });

    it('updates the password and invalidates all tokens on success', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
      mockBcryptCompare.mockResolvedValue(true);
      mockBcryptHash.mockResolvedValue('new-hashed-password');

      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      const deleteMock = vi.fn(() => ({ where: deleteWhere }));
      const selectLimit = vi.fn().mockResolvedValue([{ id: 'prt-1', userId: 'user-1', tokenHash: 'hashed-token' }]);
      const selectWhere = vi.fn(() => ({ limit: selectLimit }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
      vi.mocked(getDb).mockReturnValue({
        delete: deleteMock,
        select: vi.fn(() => ({ from: selectFrom })),
        update: vi.fn(() => ({ set: updateSet })),
      } as never);

      await expect(authService.resetPassword('valid-token', 'newpassword123')).resolves.toBeUndefined();

      expect(mockBcryptCompare).toHaveBeenCalledWith('valid-token', 'hashed-token');
      expect(mockBcryptHash).toHaveBeenCalledWith('newpassword123', 12);
      expect(updateSet).toHaveBeenCalledWith({
        passwordHash: 'new-hashed-password',
        updatedAt: new Date('2026-06-05T00:00:00.000Z'),
      });
      // 1: expired cleanup, 2: delete reset tokens for user, 3: delete refresh tokens for user
      expect(deleteMock).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });
  });
});
