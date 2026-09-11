import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const roomVisibilityEnum = pgEnum('room_visibility', ['PUBLIC', 'LINK_ONLY']);
export const roomStatusEnum = pgEnum('room_status', ['ACTIVE', 'ENDED']);
export const roomSessionStatusEnum = pgEnum('room_session_status', ['ACTIVE', 'ENDED']);
export const managementRoleEnum = pgEnum('management_role', ['HOST', 'CO_HOST', 'NONE']);
export const audioRoleEnum = pgEnum('audio_role', ['SPEAKER', 'LISTENER']);
export const participantStatusEnum = pgEnum('participant_status', [
  'CONNECTED',
  'DISCONNECTED',
  'LEFT',
  'REMOVED',
]);
export const participantSessionStatusEnum = pgEnum('participant_session_status', [
  'ACTIVE',
  'DISCONNECTED',
  'CLOSED',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 2048 }),
    bio: varchar('bio', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    usersCreatedAtIdx: index('users_created_at_idx').on(table.createdAt),
  })
);

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    hostUserId: uuid('host_user_id')
      .notNull()
      .references(() => users.id),
    visibility: roomVisibilityEnum('visibility').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    status: roomStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  table => ({
    roomsStatusCreatedAtIdx: index('rooms_status_created_at_idx').on(table.status, table.createdAt),
    roomsHostUserIdIdx: index('rooms_host_user_id_idx').on(table.hostUserId),
  })
);

export const roomSessions = pgTable(
  'room_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: roomSessionStatusEnum('status').notNull().default('ACTIVE'),
    expiryWarningIssuedAt: timestamp('expiry_warning_issued_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  table => ({
    roomSessionsRoomIdIdx: index('room_sessions_room_id_idx').on(table.roomId),
    roomSessionsStatusExpiresAtIdx: index('room_sessions_status_expires_at_idx').on(
      table.status,
      table.expiresAt
    ),
    roomSessionsOneActivePerRoomIdx: uniqueIndex('room_sessions_one_active_per_room_idx')
      .on(table.roomId)
      .where(sql`status = 'ACTIVE'`),
  })
);

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    roomSessionId: uuid('room_session_id')
      .notNull()
      .references(() => roomSessions.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    managementRole: managementRoleEnum('management_role').notNull().default('NONE'),
    audioRole: audioRoleEnum('audio_role').notNull().default('LISTENER'),
    status: participantStatusEnum('status').notNull().default('CONNECTED'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  table => ({
    participantsRoomSessionStatusIdx: index('participants_room_session_status_idx').on(
      table.roomSessionId,
      table.status
    ),
    participantsUserIdIdx: index('participants_user_id_idx').on(table.userId),
  })
);

export const participantSessions = pgTable(
  'participant_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    connectionId: varchar('connection_id', { length: 128 }).notNull(),
    status: participantSessionStatusEnum('status').notNull().default('ACTIVE'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull(),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    intentionalLeave: integer('intentional_leave').notNull().default(0),
    recoverableUntil: timestamp('recoverable_until', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  table => ({
    participantSessionsParticipantStatusIdx: index(
      'participant_sessions_participant_status_idx'
    ).on(table.participantId, table.status),
    participantSessionsConnectionIdIdx: uniqueIndex('participant_sessions_connection_id_idx').on(
      table.connectionId
    ),
  })
);
