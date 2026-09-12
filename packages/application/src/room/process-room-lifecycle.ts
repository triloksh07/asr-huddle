import {
  isExpired,
  markExpiryWarningIssued,
  shouldIssueExpiryWarning,
  type RoomSessionState,
} from '@repo/domain';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
  RoomSessionRepository,
} from '../ports.js';
import { EndRoom } from './end-room.js';

export type RoomEndReason = 'EXPIRY' | 'EMPTY';

export interface EndedRoomLifecycleResult {
  readonly roomId: string;
  readonly roomSessionId: string;
  readonly reason: RoomEndReason;
}

export interface RoomLifecycleResult {
  readonly warningsIssued: number;
  readonly endedRooms: readonly EndedRoomLifecycleResult[];
}

/**
 * Evaluates durable room lifecycle state. This deliberately has no knowledge of
 * sockets or SFU objects; the API runtime performs that process-local teardown
 * after an ended room is returned here.
 */
export class ProcessRoomLifecycle {
  constructor(
    private readonly sessions: RoomSessionRepository,
    private readonly participants: ParticipantRepository,
    private readonly participantSessions: ParticipantSessionRepository,
    private readonly endRoom: EndRoom,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher
  ) {}

  async execute(): Promise<RoomLifecycleResult> {
    const now = this.clock.now();
    const activeSessions = await this.sessions.findActive();
    const endedRooms: EndedRoomLifecycleResult[] = [];
    let warningsIssued = 0;

    for (const session of activeSessions) {
      if (isExpired(session, now)) {
        await this.end(session, 'EXPIRY', endedRooms);
        continue;
      }

      if (shouldIssueExpiryWarning(session, now)) {
        const warned = markExpiryWarningIssued(session, now);
        await this.sessions.save(warned);
        await this.events.publish({
          type: 'room.expiry.warning',
          occurredAt: now,
          roomId: session.roomId,
          roomSessionId: session.id,
          payload: {
            roomId: session.roomId,
            roomSessionId: session.id,
            expiresAt: session.expiresAt.toISOString(),
          },
        });
        warningsIssued += 1;
      }

      if (await this.isEmptyBeyondRecovery(session, now)) {
        await this.end(session, 'EMPTY', endedRooms);
      }
    }

    return { warningsIssued, endedRooms };
  }

  private async end(
    session: RoomSessionState,
    reason: RoomEndReason,
    endedRooms: EndedRoomLifecycleResult[]
  ): Promise<void> {
    await this.endRoom.execute({ roomId: session.roomId, reason });
    endedRooms.push({ roomId: session.roomId, roomSessionId: session.id, reason });
  }

  private async isEmptyBeyondRecovery(session: RoomSessionState, now: Date): Promise<boolean> {
    const participants = await this.participants.findByRoomSession(session.id);
    if (participants.length === 0) return false;

    for (const participant of participants) {
      if (participant.status === 'CONNECTED') return false;
      if (participant.status !== 'DISCONNECTED') continue;

      const participantSessions = await this.participantSessions.findByParticipantId(
        participant.id
      );
      if (
        participantSessions.some(
          participantSession =>
            !participantSession.intentionalLeave &&
            participantSession.recoverableUntil !== null &&
            participantSession.recoverableUntil.getTime() > now.getTime()
        )
      ) {
        return false;
      }
    }

    return true;
  }
}
