import { assertCanModerate } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  SpeakerRequestRepository,
} from '../ports.js';
export class DenySpeakerRequest {
  constructor(
    private requests: SpeakerRequestRepository,
    private participants: ParticipantRepository,
    private clock: ApplicationClock,
    private events: EventPublisher
  ) {}
  async execute(c: { requestId: string; moderatorParticipantId: string }) {
    const m = await this.participants.findById(c.moderatorParticipantId);
    if (!m) throw new ApplicationError('NOT_FOUND', 'Moderator was not found.');
    assertCanModerate(m.managementRole);
    const r = await this.requests.findById(c.requestId);
    if (!r) throw new ApplicationError('NOT_FOUND', 'Speaker request was not found.');
    const p = await this.participants.findById(r.participantId);
    if (!p) throw new ApplicationError('NOT_FOUND', 'Requested participant was not found.');
    const resolved = {
      ...r,
      status: 'DENIED' as const,
      resolvedAt: this.clock.now(),
      resolvedByParticipantId: m.id,
    };
    await this.requests.save(resolved);
    await this.events.publish({
      type: 'speaker.request.denied',
      occurredAt: this.clock.now(),
      roomId: p.roomId,
      roomSessionId: p.roomSessionId,
      participantId: p.id,
      payload: { requestId: r.id, resolvedByParticipantId: m.id },
    });
    return resolved;
  }
}
