import { acceptInvitation, declineInvitation, promoteToSpeaker } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  InvitationRepository,
  ParticipantRepository,
} from '../ports.js';
export class RespondInvitation {
  constructor(
    private invitations: InvitationRepository,
    private participants: ParticipantRepository,
    private clock: ApplicationClock,
    private events: EventPublisher
  ) {}
  async execute(c: { invitationId: string; participantId: string; accept: boolean }) {
    const i = await this.invitations.findById(c.invitationId);
    if (!i) throw new ApplicationError('NOT_FOUND', 'Invitation was not found.');
    if (i.targetParticipantId !== c.participantId)
      throw new ApplicationError('FORBIDDEN', 'Only the invited participant can respond.');
    const p = await this.participants.findById(c.participantId);
    if (!p) throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    if (p.status !== 'CONNECTED')
      throw new ApplicationError(
        'INVALID_STATE',
        'Only connected participants can accept an invitation.'
      );
    const resolved = c.accept
      ? acceptInvitation(i, this.clock.now())
      : declineInvitation(i, this.clock.now());
    if (c.accept) {
      const speakers = (await this.participants.findByRoomSession(p.roomSessionId)).filter(
        x => x.status === 'CONNECTED' && x.audioRole === 'SPEAKER'
      ).length;
      if (speakers >= 10)
        throw new ApplicationError('CONFLICT', 'The speaker limit has been reached.');
      const updated = promoteToSpeaker(p);
      await this.participants.save(updated);
      await this.invitations.save(resolved);
      await this.events.publish({
        type: 'speaker.invitation.accepted',
        occurredAt: this.clock.now(),
        roomId: p.roomId,
        roomSessionId: p.roomSessionId,
        participantId: p.id,
        payload: { invitationId: i.id },
      });
      await this.events.publish({
        type: 'participant.role.changed',
        occurredAt: this.clock.now(),
        roomId: p.roomId,
        roomSessionId: p.roomSessionId,
        participantId: p.id,
        payload: {
          audioRole: updated.audioRole,
          managementRole: updated.managementRole,
        },
      });
      return { invitation: resolved, participant: updated };
    }
    await this.invitations.save(resolved);
    await this.events.publish({
      type: 'speaker.invitation.declined',
      occurredAt: this.clock.now(),
      roomId: p.roomId,
      roomSessionId: p.roomSessionId,
      participantId: p.id,
      payload: { invitationId: i.id },
    });
    return { invitation: resolved, participant: p };
  }
}
