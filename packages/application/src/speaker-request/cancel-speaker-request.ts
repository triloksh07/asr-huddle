import { cancelSpeakerRequest } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type { ApplicationClock, EventPublisher, SpeakerRequestRepository } from '../ports.js';
export class CancelSpeakerRequest {
  constructor(
    private requests: SpeakerRequestRepository,
    private clock: ApplicationClock,
    private events?: EventPublisher
  ) {}
  async execute(c: { requestId: string; participantId: string }) {
    const r = await this.requests.findById(c.requestId);
    if (!r) throw new ApplicationError('NOT_FOUND', 'Speaker request was not found.');
    if (r.participantId !== c.participantId)
      throw new ApplicationError(
        'FORBIDDEN',
        'Only the requesting participant can cancel this request.'
      );
    const x = cancelSpeakerRequest(r, this.clock.now(), c.participantId as never);
    await this.requests.save(x);
    if (this.events)
      await this.events.publish({
        type: 'speaker.request.cancelled',
        occurredAt: this.clock.now(),
        roomSessionId: r.roomSessionId,
        participantId: r.participantId,
        payload: { requestId: r.id },
      });
    return x;
  }
}
