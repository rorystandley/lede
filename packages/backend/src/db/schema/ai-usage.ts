import { pgTable, uuid, varchar, integer, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const aiUsageLog = pgTable('ai_usage_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  operation: varchar('operation', { length: 50 }).notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  estimatedCostUsd: decimal('estimated_cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ai_usage_user_date').on(t.userId, t.createdAt),
]);
