import { z } from 'zod';
import { REACTION_TYPES, type ReactionType } from '@repo/domain';
import type { SendReaction, SetHandRaised } from '@repo/application';
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from '../types.js';
import { realtimeErrors } from '../errors.js';
const reactionSchema = z.object({ type: z.enum(REACTION_TYPES) });
const handSchema = z.object({ raised: z.boolean() });
function participantId(context: RealtimeCommandContext): string {
  if (!context.connection.participantId)
    throw realtimeErrors.invalidState('Connection is not attached to a participant.');
  return context.connection.participantId;
}
export class SetHandRaisedRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'speaker.hand';
  constructor(private readonly useCase: SetHandRaised) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    const parsed = handSchema.safeParse(envelope.payload);
    if (!parsed.success) throw realtimeErrors.invalidState('Invalid hand state payload.');
    return this.useCase.execute({
      participantId: participantId(context),
      raised: parsed.data.raised,
    });
  }
}
export class SendReactionRealtimeCommand implements RealtimeCommandHandler {
  readonly type = 'room.reaction';
  constructor(private readonly useCase: SendReaction) {}
  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    const parsed = reactionSchema.safeParse(envelope.payload);
    if (!parsed.success) throw realtimeErrors.invalidState('Invalid reaction payload.');
    return this.useCase.execute({
      participantId: participantId(context),
      type: parsed.data.type as ReactionType,
    });
  }
}
