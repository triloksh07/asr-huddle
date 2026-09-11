import { DomainError } from '../shared.js';
import type { ParticipantState } from '../participant/index.js';
import type { RoomSessionState } from '../room/index.js';
import type { ManagementRole } from '../participant/index.js';

export const ROOM_CAPACITY = {
  MAX_CO_HOSTS: 5,
  MAX_SPEAKERS: 10,
  MAX_LISTENERS: 50,
  MAX_PARTICIPANTS: 60,
} as const;

export type ParticipantCounts = Readonly<{
  coHosts: number;
  speakers: number;
  listeners: number;
}>;

export function assertCanAddListener(counts: ParticipantCounts): void {
  if (counts.listeners >= ROOM_CAPACITY.MAX_LISTENERS) {
    throw new DomainError(
      'LISTENER_CAPACITY_EXCEEDED',
      'The room has reached its listener capacity.'
    );
  }

  if (totalParticipants(counts) >= ROOM_CAPACITY.MAX_PARTICIPANTS) {
    throw new DomainError(
      'ROOM_CAPACITY_EXCEEDED',
      'The room has reached its participant capacity.'
    );
  }
}

export function assertCanAddSpeaker(counts: ParticipantCounts): void {
  if (counts.speakers >= ROOM_CAPACITY.MAX_SPEAKERS) {
    throw new DomainError(
      'SPEAKER_CAPACITY_EXCEEDED',
      'The room has reached its speaker capacity.'
    );
  }

  if (totalParticipants(counts) >= ROOM_CAPACITY.MAX_PARTICIPANTS) {
    throw new DomainError(
      'ROOM_CAPACITY_EXCEEDED',
      'The room has reached its participant capacity.'
    );
  }
}

export function assertCanPromoteToCoHost(counts: ParticipantCounts): void {
  if (counts.coHosts >= ROOM_CAPACITY.MAX_CO_HOSTS) {
    throw new DomainError(
      'CO_HOST_CAPACITY_EXCEEDED',
      'The room has reached its co-host capacity.'
    );
  }
}

export function assertCanModerate(role: ManagementRole): void {
  if (role !== 'HOST' && role !== 'CO_HOST') {
    throw new DomainError('FORBIDDEN', 'This participant does not have management authority.');
  }
}

export function assertRoomSessionActive(session: RoomSessionState): void {
  if (session.status !== 'ACTIVE') {
    throw new DomainError('ROOM_SESSION_ENDED', 'The room session is no longer active.');
  }
}

export function assertCanModerateTarget(actor: ParticipantState, target: ParticipantState): void {
  assertCanModerate(actor.managementRole);

  if (actor.id === target.id) {
    throw new DomainError('INVALID_TARGET', 'A participant cannot moderate themselves.');
  }

  if (actor.managementRole === 'CO_HOST' && target.managementRole === 'HOST') {
    throw new DomainError('FORBIDDEN', 'A co-host cannot moderate the host.');
  }

  if (target.managementRole === 'CO_HOST' && actor.managementRole !== 'HOST') {
    throw new DomainError('FORBIDDEN', 'Only the host can manage a co-host.');
  }
}

export function totalParticipants(counts: ParticipantCounts): number {
  return counts.speakers + counts.listeners;
}
