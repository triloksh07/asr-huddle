import { z } from "zod";
import type { RealtimeCommandContext, RealtimeCommandHandler, RealtimeEnvelope } from "../types.js";
import type { MediaController } from "../../media/media-controller.js";
import { realtimeErrors } from "../errors.js";

const emptySchema = z.object({});

function requireMediaSession(context: RealtimeCommandContext) {
  const { roomId, participantId, participantSessionId } = context.connection;
  if (!roomId || !participantId || !participantSessionId) {
    throw realtimeErrors.invalidState("Connection is not attached to an active participant session.");
  }
  return { roomId, participantId, participantSessionId };
}

export class CreateMediaTransportCommand implements RealtimeCommandHandler {
  readonly type = "media.transport.create";
  constructor(private readonly media: MediaController) {}

  async handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    emptySchema.parse(envelope.payload);
    return this.media.createTransport(requireMediaSession(context) as never);
  }
}

export class ConnectMediaTransportCommand implements RealtimeCommandHandler {
  readonly type = "media.transport.connect";
  constructor(private readonly media: MediaController) {}

  async handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.media.connectTransport(requireMediaSession(context) as never, envelope.payload);
  }
}

export class ProduceAudioCommand implements RealtimeCommandHandler {
  readonly type = "media.audio.produce";
  constructor(private readonly media: MediaController) {}

  async handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.media.produceAudio(requireMediaSession(context) as never, envelope.payload);
  }
}

export class ListAudioProducersCommand implements RealtimeCommandHandler {
  readonly type = "media.audio.producers";
  constructor(private readonly media: MediaController) {}

  async handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    emptySchema.parse(envelope.payload);
    return this.media.listAudioProducers(requireMediaSession(context) as never);
  }
}

export class ConsumeAudioCommand implements RealtimeCommandHandler {
  readonly type = "media.audio.consume";
  constructor(private readonly media: MediaController) {}

  async handle(context: RealtimeCommandContext, envelope: RealtimeEnvelope) {
    return this.media.consumeAudio(requireMediaSession(context) as never, envelope.payload);
  }
}
