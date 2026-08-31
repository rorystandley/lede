#!/usr/bin/env node

import { randomBytes } from 'node:crypto';

const SECRET_BYTES = 32;

for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
  console.log(`${name}=${randomBytes(SECRET_BYTES).toString('hex')}`);
}
