import type {
  ParticipantSessionState,
  ParticipantState,
  RoomSessionState,
  RoomState,
} from '@repo/domain';
import { CredentialUserRecord, UserRecord } from '@repo/application';
import {
  participantSessionStatusEnum,
  participantStatusEnum,
  roomSessionStatusEnum,
  roomStatusEnum,
} from './schema.js';

type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  bio: string | null;
};
type RoomRow = {
  id: string;
  hostUserId: string;
  title: string;
  description: string;
  visibility: 'PUBLIC' | 'LINK_ONLY';
  durationMinutes: number;
  status: 'ACTIVE' | 'ENDED';
  createdAt: Date;
  endedAt: Date | null;
};
type RoomSessionRow = {
  id: string;
  roomId: string;
  startedAt: Date;
  expiresAt: Date;
  status: 'ACTIVE' | 'ENDED';
  expiryWarningIssuedAt: Date | null;
  endedAt: Date | null;
};
type ParticipantRow = {
  id: string;
  roomId: string;
  roomSessionId: string;
  userId: string;
  managementRole: 'HOST' | 'CO_HOST' | 'NONE';
  audioRole: 'SPEAKER' | 'LISTENER';
  status: 'CONNECTED' | 'DISCONNECTED' | 'LEFT' | 'REMOVED';
  joinedAt: Date;
  disconnectedAt: Date | null;
  leftAt: Date | null;
  removedAt: Date | null;
  selfMuted: number;
  moderatorMuted: number;
};
type ParticipantSessionRow = {
  id: string;
  participantId: string;
  connectionId: string | null;
  connectedAt: Date;
  disconnectedAt: Date | null;
  intentionalLeave: number;
  recoverableUntil: Date | null;
};

export function mapUser(row: UserRow): UserRecord {
  return { id: row.id, name: row.name, email: row.email, avatarUrl: row.avatarUrl, bio: row.bio };
}
export function mapCredentialUser(row: UserRow): CredentialUserRecord {
  return { ...mapUser(row), email: row.email, passwordHash: row.passwordHash };
}
export function mapRoom(row: RoomRow): RoomState {
  return {
    id: row.id as RoomState['id'],
    hostUserId: row.hostUserId as RoomState['hostUserId'],
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    durationMinutes: row.durationMinutes as RoomState['durationMinutes'],
    status: row.status,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
  };
}
export function mapRoomSession(row: RoomSessionRow): RoomSessionState {
  return {
    id: row.id as RoomSessionState['id'],
    roomId: row.roomId as RoomSessionState['roomId'],
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    status: row.status,
    expiryWarningIssuedAt: row.expiryWarningIssuedAt,
    endedAt: row.endedAt,
  };
}
export function mapParticipant(row: ParticipantRow): ParticipantState {
  return {
    id: row.id as ParticipantState['id'],
    roomId: row.roomId as ParticipantState['roomId'],
    roomSessionId: row.roomSessionId as ParticipantState['roomSessionId'],
    userId: row.userId as ParticipantState['userId'],
    managementRole: row.managementRole,
    audioRole: row.audioRole,
    status: row.status,
    joinedAt: row.joinedAt,
    disconnectedAt: row.disconnectedAt,
    leftAt: row.leftAt,
    removedAt: row.removedAt,
    selfMuted: row.selfMuted === 1,
    moderatorMuted: row.moderatorMuted === 1,
  };
}
export function mapParticipantSession(row: ParticipantSessionRow): ParticipantSessionState {
  return {
    id: row.id as ParticipantSessionState['id'],
    participantId: row.participantId as ParticipantSessionState['participantId'],
    connectionId: row.connectionId as ParticipantSessionState['connectionId'],
    connectedAt: row.connectedAt,
    disconnectedAt: row.disconnectedAt,
    intentionalLeave: row.intentionalLeave === 1,
    recoverableUntil: row.recoverableUntil,
  };
}
