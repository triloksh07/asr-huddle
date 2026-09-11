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
  joinedAt: Date;
  disconnectedAt: Date | null;
  leftAt: Date | null;
  removedAt: Date | null;
  selfMuted: boolean;
  moderatorMuted: boolean;
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
    joinedAt: input.joinedAt,
    disconnectedAt: null,
    leftAt: null,
    removedAt: null,
    selfMuted: false,
    moderatorMuted: false,
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
    joinedAt: input.joinedAt,
    disconnectedAt: null,
    leftAt: null,
    removedAt: null,
    selfMuted: false,
    moderatorMuted: false,
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

export function canTransmitAudio(participant: ParticipantState): boolean {
  return (
    participant.status === 'CONNECTED' &&
    participant.audioRole === 'SPEAKER' &&
    !participant.selfMuted &&
    !participant.moderatorMuted
  );
}

export function markDisconnected(
  participant: ParticipantState,
  disconnectedAt: Date
): ParticipantState {
  if (participant.status === 'LEFT' || participant.status === 'REMOVED') return participant;
  return { ...participant, status: 'DISCONNECTED', disconnectedAt };
}

export function markReconnected(participant: ParticipantState): ParticipantState {
  if (participant.status === 'LEFT' || participant.status === 'REMOVED') {
    throw new DomainError('INVALID_STATE', 'This participant cannot be reconnected.');
  }
  return { ...participant, status: 'CONNECTED', disconnectedAt: null };
}

export function markLeft(participant: ParticipantState, leftAt: Date): ParticipantState {
  if (participant.status === 'LEFT') return participant;
  if (participant.status === 'REMOVED') {
    throw new DomainError('PARTICIPANT_REMOVED', 'A removed participant cannot leave again.');
  }
  return { ...participant, status: 'LEFT', leftAt };
}

export function markRemoved(participant: ParticipantState, removedAt: Date): ParticipantState {
  if (participant.status === 'REMOVED') return participant;
  return {
    ...participant,
    status: 'REMOVED',
    managementRole: 'NONE',
    audioRole: 'LISTENER',
    removedAt,
  };
}

export function markSessionDisconnected(
  session: ParticipantSessionState,
  disconnectedAt: Date,
  recoverableUntil: Date | null
): ParticipantSessionState {
  if (session.disconnectedAt !== null) return session;
  return { ...session, disconnectedAt, recoverableUntil };
}

export function markSessionReconnected(
  session: ParticipantSessionState,
  connectionId: ConnectionId,
  connectedAt: Date
): ParticipantSessionState {
  if (session.intentionalLeave) {
    throw new DomainError('INVALID_STATE', 'An intentionally closed session cannot reconnect.');
  }
  return {
    ...session,
    connectionId,
    connectedAt,
    disconnectedAt: null,
    recoverableUntil: null,
  };
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
  if (participant.status !== 'CONNECTED') {
    throw new DomainError(
      'PARTICIPANT_NOT_CONNECTED',
      'This participant is not currently connected.'
    );
  }
}
