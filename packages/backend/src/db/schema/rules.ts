import { pgTable, uuid, varchar, boolean, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  conditions: jsonb('conditions').notNull().$type<unknown[]>(),
  actions: jsonb('actions').notNull().$type<unknown[]>(),
  matchMode: varchar('match_mode', { length: 10 }).notNull().default('all'),
  runCount: integer('run_count').notNull().default(0),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_rules_user_enabled').on(t.userId, t.enabled),
]);
