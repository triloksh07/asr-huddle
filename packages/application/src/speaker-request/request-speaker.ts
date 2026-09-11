import { createSpeakerRequest, assertRoomSessionActive } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  IdGenerator,
  ParticipantRepository,
  RoomSessionRepository,
  SpeakerRequestRepository,
} from '../ports.js';
export interface RequestSpeakerCommand {
  readonly participantId: string;
}
export class RequestSpeaker {
  constructor(
    private participants: ParticipantRepository,
    private sessions: RoomSessionRepository,
    private requests: SpeakerRequestRepository,
    private ids: IdGenerator,
    private clock: ApplicationClock,
    private events?: EventPublisher
  ) {}
  async execute(c: RequestSpeakerCommand) {
    const p = await this.participants.findById(c.participantId);
    if (!p) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    if (p.status !== 'CONNECTED')
      throw new ApplicationError(
        'INVALID_STATE',
        'Only connected participants can request to speak.'
      );
    if (p.audioRole === 'SPEAKER')
      throw new ApplicationError('CONFLICT', 'Participant is already a speaker.');
    const s = await this.sessions.findActiveByRoomId(p.roomId);
    if (!s) throw new ApplicationError('ROOM_ENDED', 'The room is not active.');
    assertRoomSessionActive(s);
    if (await this.requests.findPendingByParticipantId(p.id))
      throw new ApplicationError('CONFLICT', 'A speaker request is already pending.');
    const r = createSpeakerRequest({
      id: this.ids.next() as never,
      roomSessionId: p.roomSessionId,
      participantId: p.id,
      createdAt: this.clock.now(),
    });
    await this.requests.save(r);
    if (this.events)
      await this.events.publish({
        type: 'speaker.request.created',
        occurredAt: this.clock.now(),
        roomId: p.roomId,
        roomSessionId: p.roomSessionId,
        participantId: p.id,
        payload: { requestId: r.id, createdAt: r.createdAt },
      });
    return r;
  }
}
