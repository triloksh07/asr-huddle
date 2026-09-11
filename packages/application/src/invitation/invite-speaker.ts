import { assertCanModerate, createInvitation } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  IdGenerator,
  InvitationRepository,
  ParticipantRepository,
} from '../ports.js';
export class InviteSpeaker {
  constructor(
    private invitations: InvitationRepository,
    private participants: ParticipantRepository,
    private ids: IdGenerator,
    private clock: ApplicationClock,
    private events: EventPublisher
  ) {}
  async execute(c: { targetParticipantId: string; moderatorParticipantId: string }) {
    const m = await this.participants.findById(c.moderatorParticipantId);
    const t = await this.participants.findById(c.targetParticipantId);
    if (!m || !t) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    assertCanModerate(m.managementRole);
    if (m.roomSessionId !== t.roomSessionId)
      throw new ApplicationError('FORBIDDEN', 'Participants are not in the same room session.');
    if (t.status !== 'CONNECTED' || t.audioRole === 'SPEAKER')
      throw new ApplicationError('INVALID_STATE', 'Only connected listeners can be invited.');
    if (await this.invitations.findPendingByParticipantId(t.id))
      throw new ApplicationError('CONFLICT', 'An invitation is already pending.');
    const invitation = createInvitation({
      id: this.ids.next() as never,
      roomSessionId: t.roomSessionId,
      targetParticipantId: t.id,
      createdAt: this.clock.now(),
    });
    await this.invitations.save(invitation);
    await this.events.publish({
      type: 'speaker.invitation.created',
      occurredAt: this.clock.now(),
      roomId: t.roomId,
      roomSessionId: t.roomSessionId,
      participantId: t.id,
      payload: { invitationId: invitation.id, invitedByParticipantId: m.id },
    });
    return invitation;
  }
}
