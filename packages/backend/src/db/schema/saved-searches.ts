import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  query: varchar('query', { length: 500 }).notNull(),
  filters: jsonb('filters').$type<Record<string, unknown> | null>(),
  isMonitor: boolean('is_monitor').notNull().default(false),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_saved_searches_user').on(t.userId),
  index('idx_saved_searches_monitor').on(t.userId, t.isMonitor),
]);
