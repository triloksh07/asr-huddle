import { pgTable, uuid, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 100 }).notNull(),
  hostId: uuid('host_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active' | 'ended'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
});
