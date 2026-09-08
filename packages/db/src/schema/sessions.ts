import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { rooms } from './rooms';

export const roomSessions = pgTable('room_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id')
    .references(() => rooms.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'host' | 'cohost' | 'speaker' | 'listener'
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
});
