import type {
  ConnectTransportCommand,
  ConsumeAudioCommand,
  CreateRoomMediaContext,
  JoinMediaContext,
  MediaService,
  ProduceAudioCommand,
} from '@repo/media-contract';
import type { ParticipantId, ParticipantSessionId, RoomId, RoomSessionId } from '@repo/domain';
import {
  connectTransportSchema,
  consumeAudioSchema,
  produceAudioSchema,
} from '@repo/media-contract';
import { MediaControlError } from './media-errors.js';

export interface MediaSessionContext {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
}

export class MediaController {
  constructor(private readonly media: MediaService) {}

  createRouter(context: CreateRoomMediaContext) {
    return this.media.createRouter(context);
  }

  async createTransport(context: MediaSessionContext) {
    return this.media.createWebRtcTransport(context);
  }

  async connectTransport(context: MediaSessionContext, payload: unknown): Promise<void> {
    const parsed = connectTransportSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid transport connection payload.');
    }
    await this.media.connectWebRtcTransport(parsed.data as ConnectTransportCommand);
  }

  async produceAudio(context: MediaSessionContext, payload: unknown) {
    const parsed = produceAudioSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid audio producer payload.');
    }

    if (
      parsed.data.appData.participantId !== context.participantId ||
      parsed.data.appData.participantSessionId !== context.participantSessionId
    ) {
      throw new MediaControlError(
        'MEDIA_IDENTITY_MISMATCH',
        'Producer identity does not match the realtime session.'
      );
    }

    return this.media.produceAudio(parsed.data as ProduceAudioCommand);
  }

  async listAudioProducers(context: MediaSessionContext) {
    return this.media.listAudioProducers(context);
  }

  async consumeAudio(context: MediaSessionContext, payload: unknown) {
    const parsed = consumeAudioSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid audio consumer payload.');
    }

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
