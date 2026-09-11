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
export const speakerRequestStatusEnum = pgEnum('speaker_request_status', [
  'PENDING',
  'APPROVED',
  'DENIED',
  'CANCELLED',
]);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
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
  t => ({ usersCreatedAtIdx: index('users_created_at_idx').on(t.createdAt) })
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
  t => ({
    roomsStatusCreatedAtIdx: index('rooms_status_created_at_idx').on(t.status, t.createdAt),
    roomsHostUserIdIdx: index('rooms_host_user_id_idx').on(t.hostUserId),
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
    expiryWarningIssuedAt: timestamp('expiry_warning_issued_at', {
      withTimezone: true,
    }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  t => ({
    roomSessionsRoomIdIdx: index('room_sessions_room_id_idx').on(t.roomId),
    roomSessionsStatusExpiresAtIdx: index('room_sessions_status_expires_at_idx').on(
      t.status,
      t.expiresAt
    ),
    roomSessionsOneActivePerRoomIdx: uniqueIndex('room_sessions_one_active_per_room_idx')
      .on(t.roomId)
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
  t => ({
    participantsRoomSessionStatusIdx: index('participants_room_session_status_idx').on(
      t.roomSessionId,
      t.status
    ),
    participantsUserIdIdx: index('participants_user_id_idx').on(t.userId),
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
  t => ({
    participantSessionsParticipantStatusIdx: index(
      'participant_sessions_participant_status_idx'
    ).on(t.participantId, t.status),
    participantSessionsConnectionIdIdx: uniqueIndex('participant_sessions_connection_id_idx').on(
      t.connectionId
    ),
  })
);
export const speakerRequests = pgTable(
  'speaker_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomSessionId: uuid('room_session_id')
      .notNull()
      .references(() => roomSessions.id),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    status: speakerRequestStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByParticipantId: uuid('resolved_by_participant_id').references(() => participants.id),
  },
  t => ({
    speakerRequestsParticipantStatusIdx: index('speaker_requests_participant_status_idx').on(
      t.participantId,
      t.status
    ),
    speakerRequestsRoomSessionStatusIdx: index('speaker_requests_room_session_status_idx').on(
      t.roomSessionId,
      t.status
    ),
    speakerRequestsOnePendingParticipantIdx: uniqueIndex(
      'speaker_requests_one_pending_participant_idx'
    )
      .on(t.participantId)
      .where(sql`status = 'PENDING'`),
  })
);
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomSessionId: uuid('room_session_id')
      .notNull()
      .references(() => roomSessions.id),
    targetParticipantId: uuid('target_participant_id')
      .notNull()
      .references(() => participants.id),
    status: invitationStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  t => ({
    invitationsTargetStatusIdx: index('invitations_target_status_idx').on(
      t.targetParticipantId,
      t.status
    ),
    invitationsRoomSessionStatusIdx: index('invitations_room_session_status_idx').on(
      t.roomSessionId,
      t.status
    ),
    invitationsOnePendingTargetIdx: uniqueIndex('invitations_one_pending_target_idx')
      .on(t.targetParticipantId)
      .where(sql`status = 'PENDING'`),
  })
);
