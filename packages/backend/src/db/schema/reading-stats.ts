import { pgTable, uuid, date, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const readingStats = pgTable('reading_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  articlesRead: integer('articles_read').notNull().default(0),
  totalTimeMs: integer('total_time_ms').notNull().default(0),
  feedsVisited: integer('feeds_visited').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_user_date').on(t.userId, t.date),
]);
