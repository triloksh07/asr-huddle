import { z } from 'zod';
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from '../types.js';
import type { MediaController, MediaSessionContext } from '../../media/media-controller.js';
import { realtimeErrors } from '../errors.js';
import type { ParticipantId, ParticipantSessionId, RoomId, RoomSessionId } from '@repo/domain';

const emptySchema = z.object({});

function requireMediaSession(context: RealtimeCommandContext): MediaSessionContext {
  const { roomId, roomSessionId, participantId, participantSessionId } = context.connection;
  if (!roomId || !roomSessionId || !participantId || !participantSessionId) {
    throw realtimeErrors.invalidState(
      'Connection is not attached to an active participant session.'
    );
  }
  return {
    roomId: roomId as RoomId,
    roomSessionId: roomSessionId as RoomSessionId,
    participantId: participantId as ParticipantId,
    participantSessionId: participantSessionId as ParticipantSessionId,
  };
}

export class CreateMediaTransportCommand implements RealtimeCommandHandler {
  readonly type = 'media.transport.create';
  constructor(private readonly media: MediaController) {}

  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    emptySchema.parse(envelope.payload);
    return this.media.createTransport(requireMediaSession(context), envelope.payload);
  }
}

export class ConnectMediaTransportCommand implements RealtimeCommandHandler {
  readonly type = 'media.transport.connect';
  constructor(private readonly media: MediaController) {}

  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.media.connectTransport(requireMediaSession(context), envelope.payload);
  }
}

export class ProduceAudioCommand implements RealtimeCommandHandler {
  readonly type = 'media.audio.produce';
  constructor(private readonly media: MediaController) {}

  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.media.produceAudio(requireMediaSession(context), envelope.payload);
  }
}

export class ListAudioProducersCommand implements RealtimeCommandHandler {
  readonly type = 'media.audio.producers';
  constructor(private readonly media: MediaController) {}

  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    emptySchema.parse(envelope.payload);
    return this.media.listAudioProducers(requireMediaSession(context));
  }
}

export class ConsumeAudioCommand implements RealtimeCommandHandler {
  readonly type = 'media.audio.consume';
  constructor(private readonly media: MediaController) {}

  handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.media.consumeAudio(requireMediaSession(context), envelope.payload);
  }
}
