import type {
  ConnectTransportCommand,
  ConsumeAudioCommand,
  MediaAudioState,
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
import { canTransmitAudio, type ParticipantState } from '@repo/domain';
import type { DomainEvent, EventPublisher, ParticipantRepository } from '@repo/application';
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
    private readonly now: () => Date = () => new Date(),
    private readonly participants?: ParticipantRepository
  ) {}

  private async getAuthorizedParticipant(
    context: MediaSessionContext
  ): Promise<ParticipantState | null> {
    const participant = this.participants
      ? await this.participants.findById(context.participantId)
      : null;

    if (
      this.participants &&
      (!participant ||
        participant.roomSessionId !== context.roomSessionId ||
        participant.status !== 'CONNECTED')
    ) {
      throw new MediaControlError(
        'MEDIA_UNAUTHORIZED',
        'Participant is not authorized for this media session.'
      );
    }

    return participant;
  }

  async getAudioState(context: MediaSessionContext): Promise<MediaAudioState> {
    const participant = await this.getAuthorizedParticipant(context);
    if (!participant) {
      throw new MediaControlError(
        'MEDIA_UNAUTHORIZED',
        'Participant is not authorized for media recovery.'
      );
    }

    return {
      audioRole: participant.audioRole,
      selfMuted: participant.selfMuted,
      moderatorMuted: participant.moderatorMuted,
      canTransmitAudio: canTransmitAudio(participant),
    };
  }

  async createTransport(context: MediaSessionContext, payload: unknown) {
    const parsed = createTransportSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid transport creation payload.');
    }

    const participant = await this.getAuthorizedParticipant(context);

    if (parsed.data.direction === 'send') {
      if (!participant || !canTransmitAudio(participant)) {
        throw new MediaControlError(
          'MEDIA_UNAUTHORIZED',
          'Participant is not currently authorized to transmit audio.'
        );
      }
    }

    const router = await this.media.createRouter({
      roomId: context.roomId,
      roomSessionId: context.roomSessionId,
    });
    const transport = await this.media.createWebRtcTransport(context, parsed.data.direction);

    return {
      ...transport,
      rtpCapabilities: router.rtpCapabilities,
    };
  }

  async connectTransport(context: MediaSessionContext, payload: unknown) {
    const parsed = connectTransportSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid transport connection payload.');
    }

    await this.getAuthorizedParticipant(context);
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

    const participant = await this.getAuthorizedParticipant(context);
    if (!participant || !canTransmitAudio(participant)) {
      throw new MediaControlError(
        'MEDIA_UNAUTHORIZED',
        'Participant is not currently authorized to produce audio.'
      );
    }

    const result = await this.media.produceAudio(parsed.data as ProduceAudioCommand);

    if (this.events) {
      await this.events.publish({
        type: 'media.audio.producer.created',
        occurredAt: this.now(),
        roomId: context.roomId,
        roomSessionId: context.roomSessionId,
        participantId: context.participantId,
        participantSessionId: context.participantSessionId,
        payload: {
          producerId: result.producerId,
          kind: 'audio',
        },
      } as DomainEvent);
    }

    return result;
  }

  listAudioProducers(context: MediaSessionContext) {
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

    await this.getAuthorizedParticipant(context);
    return this.media.consumeAudio(parsed.data as ConsumeAudioCommand);
  }

  closeParticipant(context: MediaSessionContext) {
    return this.media.closeParticipantMedia(context);
  }
}
