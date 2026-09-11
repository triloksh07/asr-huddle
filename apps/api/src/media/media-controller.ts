import type {
  ConnectTransportCommand,
  ConsumeAudioCommand,
  MediaService,
  ProduceAudioCommand,
} from '@repo/media-contract';
import type { ParticipantId, ParticipantSessionId, RoomId, RoomSessionId } from '@repo/domain';
import {
  connectTransportSchema,
  consumeAudioSchema,
  createTransportSchema,
  produceAudioSchema,
} from '@repo/media-contract';
import type { DomainEvent, EventPublisher } from '@repo/application';
import { MediaControlError } from './media-errors.js';

export interface MediaSessionContext {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
}

export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly events?: EventPublisher,
    private readonly now: () => Date = () => new Date()
  ) {}

  async createTransport(context: MediaSessionContext, payload: unknown) {
    const parsed = createTransportSchema.safeParse(payload);
    if (!parsed.success)
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid transport creation payload.');

    const router = await this.media.createRouter({
      roomId: context.roomId,
      roomSessionId: context.roomSessionId,
    });
    const transport = await this.media.createWebRtcTransport(context, parsed.data.direction);
    return { ...transport, rtpCapabilities: router.rtpCapabilities };
  }

  async connectTransport(_context: MediaSessionContext, payload: unknown): Promise<void> {
    const parsed = connectTransportSchema.safeParse(payload);
    if (!parsed.success)
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid transport connection payload.');
    await this.media.connectWebRtcTransport(parsed.data as ConnectTransportCommand);
  }

  async produceAudio(context: MediaSessionContext, payload: unknown) {
    const parsed = produceAudioSchema.safeParse(payload);
    if (!parsed.success)
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid audio producer payload.');
    if (
      parsed.data.appData.participantId !== context.participantId ||
      parsed.data.appData.participantSessionId !== context.participantSessionId
    ) {
      throw new MediaControlError(
        'MEDIA_IDENTITY_MISMATCH',
        'Producer identity does not match the realtime session.'
      );
    }

    const result = await this.media.produceAudio(parsed.data as ProduceAudioCommand);
    if (this.events) {
      const event: DomainEvent = {
        type: 'media.audio.producer.created',
        occurredAt: this.now(),
        roomId: context.roomId,
        roomSessionId: context.roomSessionId,
        participantId: context.participantId,
        participantSessionId: context.participantSessionId,
        payload: { producerId: result.producerId, kind: 'audio' },
      };
      await this.events.publish(event);
    }
    return result;
  }

  listAudioProducers(context: MediaSessionContext) {
    return this.media.listAudioProducers(context);
  }

  async consumeAudio(context: MediaSessionContext, payload: unknown) {
    const parsed = consumeAudioSchema.safeParse(payload);
    if (!parsed.success)
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid audio consumer payload.');
    if (
      parsed.data.participantId !== context.participantId ||
      parsed.data.participantSessionId !== context.participantSessionId ||
      parsed.data.roomId !== context.roomId
    ) {
      throw new MediaControlError(
        'MEDIA_IDENTITY_MISMATCH',
        'Consumer identity does not match the realtime session.'
      );
    }
    return this.media.consumeAudio(parsed.data as ConsumeAudioCommand);
  }

  closeParticipant(context: MediaSessionContext) {
    return this.media.closeParticipantMedia(context);
  }
}
