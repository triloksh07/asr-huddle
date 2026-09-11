import { z } from 'zod';
import type {
  ApproveSpeakerRequest,
  DenySpeakerRequest,
  InviteSpeaker,
  RequestSpeaker,
  CancelSpeakerRequest,
  RespondInvitation,
  DemoteSpeaker,
} from '@repo/application';
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from '../types.js';
import { realtimeErrors } from '../errors.js';
const id = z.object({ requestId: z.string().min(1) });
const target = z.object({ targetParticipantId: z.string().min(1) });
const invitation = z.object({ invitationId: z.string().min(1), accept: z.boolean() });
function participant(context: RealtimeCommandContext) {
  if (!context.connection.participantId)
    throw realtimeErrors.invalidState('Connection is not attached to a participant.');
  return context.connection.participantId;
}
export class RequestSpeakerRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.request';
  constructor(private u: RequestSpeaker) {}
  handle(c: RealtimeCommandContext, _e: RealtimeEnvelope) {
    return this.u.execute({ participantId: participant(c) });
  }
}
export class CancelSpeakerRequestRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.request.cancel';
  constructor(private u: CancelSpeakerRequest) {}
  handle(c: RealtimeCommandContext, e: RealtimeEnvelope) {
    const p = id.safeParse(e.payload);
    if (!p.success) throw realtimeErrors.invalidState('Invalid speaker request payload.');
    return this.u.execute({ requestId: p.data.requestId, participantId: participant(c) });
  }
}
export class ApproveSpeakerRequestRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.request.approve';
  constructor(private u: ApproveSpeakerRequest) {}
  handle(c: RealtimeCommandContext, e: RealtimeEnvelope) {
    const p = id.safeParse(e.payload);
    if (!p.success) throw realtimeErrors.invalidState('Invalid speaker request payload.');
    return this.u.execute({ requestId: p.data.requestId, moderatorParticipantId: participant(c) });
  }
}
export class DenySpeakerRequestRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.request.deny';
  constructor(private u: DenySpeakerRequest) {}
  handle(c: RealtimeCommandContext, e: RealtimeEnvelope) {
    const p = id.safeParse(e.payload);
    if (!p.success) throw realtimeErrors.invalidState('Invalid speaker request payload.');
    return this.u.execute({ requestId: p.data.requestId, moderatorParticipantId: participant(c) });
  }
}
export class InviteSpeakerRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.invite';
  constructor(private u: InviteSpeaker) {}
  handle(c: RealtimeCommandContext, e: RealtimeEnvelope) {
    const p = target.safeParse(e.payload);
    if (!p.success) throw realtimeErrors.invalidState('Invalid invitation payload.');
    return this.u.execute({
      targetParticipantId: p.data.targetParticipantId,
      moderatorParticipantId: participant(c),
    });
  }
}
export class RespondInvitationRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.invite.respond';
  constructor(private u: RespondInvitation) {}
  handle(c: RealtimeCommandContext, e: RealtimeEnvelope) {
    const p = invitation.safeParse(e.payload);
    if (!p.success) throw realtimeErrors.invalidState('Invalid invitation response payload.');
    return this.u.execute({
      invitationId: p.data.invitationId,
      participantId: participant(c),
      accept: p.data.accept,
    });
  }
}
export class DemoteSpeakerRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.demote';
  constructor(private u: DemoteSpeaker) {}
  handle(c: RealtimeCommandContext, e: RealtimeEnvelope) {
    const p = target.safeParse(e.payload);
    if (!p.success) throw realtimeErrors.invalidState('Invalid demotion payload.');
    return this.u.execute({
      targetParticipantId: p.data.targetParticipantId,
      moderatorParticipantId: participant(c),
    });
  }
}
