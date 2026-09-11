import { z } from 'zod';
import type {
  MuteParticipant,
  UnmuteParticipant,
  SetSelfMute,
  RemoveParticipant,
  PromoteCoHost,
  DemoteCoHost,
} from '@repo/application';
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from '../types.js';
import { realtimeErrors } from '../errors.js';

const targetSchema = z.object({ targetParticipantId: z.string().min(1) });
const selfMuteSchema = z.object({ muted: z.boolean() });

function participantId(context: RealtimeCommandContext): string {
  if (!context.connection.participantId) {
    throw realtimeErrors.invalidState('Connection is not attached to a participant.');
  }
  return context.connection.participantId;
}

function target(envelope: RealtimeEnvelope): string {
  const parsed = targetSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    throw realtimeErrors.invalidState('Invalid moderation target payload.');
  }
  return parsed.data.targetParticipantId;
}

export class MuteParticipantRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'moderation.mute';
  constructor(private readonly useCase: MuteParticipant) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.useCase.execute({
      moderatorParticipantId: participantId(context),
      targetParticipantId: target(envelope),
    });
  }
}

export class UnmuteParticipantRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'moderation.unmute';
  constructor(private readonly useCase: UnmuteParticipant) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.useCase.execute({
      moderatorParticipantId: participantId(context),
      targetParticipantId: target(envelope),
    });
  }
}

export class SetSelfMuteRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'moderation.self-mute';
  constructor(private readonly useCase: SetSelfMute) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    const parsed = selfMuteSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      throw realtimeErrors.invalidState('Invalid self-mute payload.');
    }
    return this.useCase.execute({
      participantId: participantId(context),
      muted: parsed.data.muted,
    });
  }
}

export class RemoveParticipantRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'moderation.remove';
  constructor(private readonly useCase: RemoveParticipant) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.useCase.execute({
      moderatorParticipantId: participantId(context),
      targetParticipantId: target(envelope),
    });
  }
}

export class PromoteCoHostRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'moderation.cohost.promote';
  constructor(private readonly useCase: PromoteCoHost) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.useCase.execute({
      moderatorParticipantId: participantId(context),
      targetParticipantId: target(envelope),
    });
  }
}

export class DemoteCoHostRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'moderation.cohost.demote';
  constructor(private readonly useCase: DemoteCoHost) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.useCase.execute({
      moderatorParticipantId: participantId(context),
      targetParticipantId: target(envelope),
    });
  }
}
