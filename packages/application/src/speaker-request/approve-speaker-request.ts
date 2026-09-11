import {
  approveSpeakerRequest,
  assertCanModerate,
  assertRoomSessionActive,
  promoteToSpeaker,
} from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  IdGenerator,
  ParticipantRepository,
  RoomSessionRepository,
  SpeakerRequestRepository,
} from '../ports.js';
export class ApproveSpeakerRequest {
  constructor(
    private requests: SpeakerRequestRepository,
    private participants: ParticipantRepository,
    private sessions: RoomSessionRepository,
    private clock: ApplicationClock,
    private events: EventPublisher
  ) {}
  async execute(c: { requestId: string; moderatorParticipantId: string }) {
    const moderator = await this.participants.findById(c.moderatorParticipantId);
    if (!moderator) throw new ApplicationError('NOT_FOUND', 'Moderator was not found.');
    assertCanModerate(moderator.managementRole);
    const request = await this.requests.findById(c.requestId);
    if (!request) throw new ApplicationError('NOT_FOUND', 'Speaker request was not found.');
    const target = await this.participants.findById(request.participantId);
    if (!target) throw new ApplicationError('NOT_FOUND', 'Requested participant was not found.');
    if (target.roomSessionId !== request.roomSessionId)
      throw new ApplicationError(
        'CONFLICT',
        'Speaker request does not belong to the participant session.'
      );
    const session = await this.sessions.findActiveByRoomId(target.roomId);
    if (!session) throw new ApplicationError('ROOM_ENDED', 'The room is not active.');
    assertRoomSessionActive(session);
    const participants = await this.participants.findByRoomSession(session.id);
    const speakers = participants.filter(
      p => p.status === 'CONNECTED' && p.audioRole === 'SPEAKER'
    ).length;
    if (speakers >= 10)
      throw new ApplicationError('CONFLICT', 'The speaker limit has been reached.');
    if (target.status !== 'CONNECTED')
      throw new ApplicationError(
        'INVALID_STATE',
        'Only connected participants can become speakers.'
      );
    const updated = promoteToSpeaker(target);
    const resolved = approveSpeakerRequest(request, this.clock.now(), moderator.id);
    await this.participants.save(updated);
    await this.requests.save(resolved);
    await this.events.publish({
      type: 'speaker.request.approved',
      occurredAt: this.clock.now(),
      roomId: target.roomId,
      roomSessionId: target.roomSessionId,
      participantId: target.id,
      payload: { requestId: request.id, resolvedByParticipantId: moderator.id },
    });
    await this.events.publish({
      type: 'participant.role.changed',
      occurredAt: this.clock.now(),
      roomId: target.roomId,
      roomSessionId: target.roomSessionId,
      participantId: target.id,
      payload: { audioRole: updated.audioRole, managementRole: updated.managementRole },
    });
    return { request: resolved, participant: updated };
  }
}
