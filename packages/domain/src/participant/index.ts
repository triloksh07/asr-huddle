import {
  DomainError,
  type ConnectionId,
  type ParticipantId,
  type ParticipantSessionId,
  type RoomId,
  type RoomSessionId,
  type UserId,
} from '../shared.js';

export type ManagementRole = 'HOST' | 'CO_HOST' | 'NONE';
export type AudioRole = 'SPEAKER' | 'LISTENER';
export type ParticipantStatus = 'CONNECTED' | 'DISCONNECTED' | 'LEFT' | 'REMOVED';

export type ParticipantState = Readonly<{
  id: ParticipantId;
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  userId: UserId;
  managementRole: ManagementRole;
  audioRole: AudioRole;
  status: ParticipantStatus;
  selfMuted: boolean;
  moderatorMuted: boolean;
  joinedAt: Date;
  disconnectedAt: Date | null;
  leftAt: Date | null;
  removedAt: Date | null;
}>;

export type ParticipantSessionState = Readonly<{
  id: ParticipantSessionId;
  participantId: ParticipantId;
  connectionId: ConnectionId;
  connectedAt: Date;
  disconnectedAt: Date | null;
  intentionalLeave: boolean;
  recoverableUntil: Date | null;
}>;

export function createHostParticipant(input: {
  id: ParticipantId;
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  userId: UserId;
  joinedAt: Date;
}): ParticipantState {
  return {
    id: input.id,
    roomId: input.roomId,
    roomSessionId: input.roomSessionId,
    userId: input.userId,
    managementRole: 'HOST',
    audioRole: 'SPEAKER',
    status: 'CONNECTED',
    selfMuted: false,
    moderatorMuted: false,
    joinedAt: input.joinedAt,
    disconnectedAt: null,
    leftAt: null,
    removedAt: null,
  };
}

export function createParticipant(input: {
  id: ParticipantId;
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  userId: UserId;
  joinedAt: Date;
}): ParticipantState {
  return {
    id: input.id,
    roomId: input.roomId,
    roomSessionId: input.roomSessionId,
    userId: input.userId,
    managementRole: 'NONE',
    audioRole: 'LISTENER',
    status: 'CONNECTED',
    selfMuted: false,
    moderatorMuted: false,
    joinedAt: input.joinedAt,
    disconnectedAt: null,
    leftAt: null,
    removedAt: null,
  };
}

export function createParticipantSession(input: {
  id: ParticipantSessionId;
  participantId: ParticipantId;
  connectionId: ConnectionId;
  connectedAt: Date;
}): ParticipantSessionState {
  return {
    id: input.id,
    participantId: input.participantId,
    connectionId: input.connectionId,
    connectedAt: input.connectedAt,
    disconnectedAt: null,
    intentionalLeave: false,
    recoverableUntil: null,
  };
}

export function promoteToSpeaker(participant: ParticipantState): ParticipantState {
  ensureConnected(participant);
  if (participant.audioRole === 'SPEAKER') return participant;
  return { ...participant, audioRole: 'SPEAKER' };
}

export function demoteToListener(participant: ParticipantState): ParticipantState {
  ensureConnected(participant);
  if (participant.managementRole === 'HOST' || participant.managementRole === 'CO_HOST') {
    throw new DomainError(
      'MANAGEMENT_PARTICIPANT_MUST_BE_SPEAKER',
      'A host or co-host cannot be demoted to listener.'
    );
  }
  return { ...participant, audioRole: 'LISTENER' };
}

export function promoteToCoHost(participant: ParticipantState): ParticipantState {
  ensureConnected(participant);
  if (participant.managementRole === 'HOST') return participant;
  return { ...participant, managementRole: 'CO_HOST', audioRole: 'SPEAKER' };
}

export function demoteFromCoHost(participant: ParticipantState): ParticipantState {
  ensureConnected(participant);
  if (participant.managementRole !== 'CO_HOST') return participant;
  return { ...participant, managementRole: 'NONE', audioRole: 'SPEAKER' };
}

export function setSelfMuted(participant: ParticipantState, muted: boolean): ParticipantState {
  ensureConnected(participant);
  return { ...participant, selfMuted: muted };
}

export function setModeratorMuted(participant: ParticipantState, muted: boolean): ParticipantState {
  ensureConnected(participant);
  return { ...participant, moderatorMuted: muted };
}

export function markDisconnected(
  participant: ParticipantState,
  disconnectedAt: Date
): ParticipantState {
  if (participant.status === 'LEFT' || participant.status === 'REMOVED') return participant;
  return { ...participant, status: 'DISCONNECTED', disconnectedAt };
}

export function markLeft(participant: ParticipantState, leftAt: Date): ParticipantState {
  if (participant.status === 'LEFT') return participant;
  if (participant.status === 'REMOVED')
    throw new DomainError('PARTICIPANT_REMOVED', 'A removed participant cannot leave again.');
  return { ...participant, status: 'LEFT', leftAt };
}

export function markRemoved(participant: ParticipantState, removedAt: Date): ParticipantState {
  if (participant.status === 'REMOVED') return participant;
  return { ...participant, status: 'REMOVED', removedAt };
}

export function markSessionDisconnected(
  session: ParticipantSessionState,
  disconnectedAt: Date,
  recoverableUntil: Date | null
): ParticipantSessionState {
  if (session.disconnectedAt !== null) return session;
  return { ...session, disconnectedAt, recoverableUntil };
}

export function markSessionIntentionalLeave(
  session: ParticipantSessionState
): ParticipantSessionState {
  return { ...session, intentionalLeave: true, recoverableUntil: null };
}

export function canRecoverParticipantSession(session: ParticipantSessionState, now: Date): boolean {
  return (
    !session.intentionalLeave &&
    session.disconnectedAt !== null &&
    session.recoverableUntil !== null &&
    now.getTime() < session.recoverableUntil.getTime()
  );
}

function ensureConnected(participant: ParticipantState): void {
  if (participant.status !== 'CONNECTED')
    throw new DomainError(
      'PARTICIPANT_NOT_CONNECTED',
      'This participant is not currently connected.'
    );
}
