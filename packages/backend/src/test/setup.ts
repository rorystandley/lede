process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= '12345678901234567890123456789012';
process.env.JWT_REFRESH_SECRET ??= '12345678901234567890123456789012';
process.env.ENCRYPTION_KEY ??= '12345678901234567890123456789012';
process.env.APP_URL ??= 'http://localhost:5173';
process.env.NODE_ENV ??= 'test';
