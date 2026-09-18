import { assertCanModerateTarget, markRemoved } from '@repo/domain';
import { ApplicationError } from '../errors.js';
import type {
  ApplicationClock,
  EventPublisher,
  InvitationRepository,
  ParticipantRepository,
  ParticipantSessionRepository,
  SpeakerRequestRepository,
} from '../ports.js';

export interface RemovedParticipantRuntime {
  closeConnection(participantId: string): Promise<void>;
  closeMedia(context: {
    roomId: string;
    roomSessionId: string;
    participantId: string;
    participantSessionId: string;
    connectionId: string;
  }): Promise<void>;
}

export class RemoveParticipant {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly sessions: ParticipantSessionRepository,
    private readonly requests: SpeakerRequestRepository,
    private readonly invitations: InvitationRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
    private readonly runtime: RemovedParticipantRuntime
  ) {}

  async execute(command: { moderatorParticipantId: string; targetParticipantId: string }) {
    const moderator = await this.participants.findById(command.moderatorParticipantId);
    const target = await this.participants.findById(command.targetParticipantId);
    if (!moderator || !target)
      throw new ApplicationError('NOT_FOUND', 'Participant was not found.');
    if (moderator.roomSessionId !== target.roomSessionId) {
      throw new ApplicationError('FORBIDDEN', 'Participants are not in the same room session.');
    }
    assertCanModerateTarget(moderator, target);

    const session = await this.sessions.findActiveByParticipantId(target.id);
    if (session) {
      // Removal revokes the participant's entire media session. Do this before committing the
      // removal so an SFU failure cannot leave a removed participant's media resources alive.
      await this.runtime.closeMedia({
        roomId: target.roomId,
        roomSessionId: target.roomSessionId,
        participantId: target.id,
        participantSessionId: session.id,
        connectionId: session.connectionId,
      });
    }

    const updated = markRemoved(target, this.clock.now());
    const request = await this.requests.findPendingByParticipantId(target.id);
    if (request) {
      await this.requests.save({ ...request, status: 'CANCELLED', resolvedAt: this.clock.now() });
    }
    const invitation = await this.invitations.findPendingByParticipantId(target.id);
    if (invitation) {
      await this.invitations.save({
        ...invitation,
        status: 'CANCELLED',
        resolvedAt: this.clock.now(),
      });
    }

    await this.participants.save({
      ...updated,
      managementRole: 'NONE',
      audioRole: 'LISTENER',
      selfMuted: true,
      moderatorMuted: false,
    });

    const now = this.clock.now();
    await this.events.publish({
      type: 'participant.removed',
      occurredAt: now,
      roomId: target.roomId,
      roomSessionId: target.roomSessionId,
      participantId: target.id,
      payload: { removedByParticipantId: moderator.id },
    });
    await this.runtime.closeConnection(target.id);
    return updated;
  }
}
