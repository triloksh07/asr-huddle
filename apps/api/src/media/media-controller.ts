import type {
  ConnectTransportCommand,
  ConsumeAudioCommand,
  MediaAudioState,
  MediaService,
  ProduceAudioCommand,
} from '@repo/media-contract';
import type {
  ParticipantId,
  ParticipantSessionId,
  RoomId,
  RoomSessionId,
  ConnectionId,
} from '@repo/domain';
import {
  connectTransportSchema,
  consumeAudioSchema,
  createTransportSchema,
  produceAudioSchema,
} from '@repo/media-contract';
import { canTransmitAudio, type ParticipantState } from '@repo/domain';
import type {
  DomainEvent,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
} from '@repo/application';
import { MediaControlError } from './media-errors.js';

export interface MediaSessionContext {
  roomId: RoomId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  participantSessionId: ParticipantSessionId;
  connectionId: ConnectionId;
}

export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly events?: EventPublisher,
    private readonly now: () => Date = () => new Date(),
    private readonly participants?: ParticipantRepository,
    private readonly participantSessions?: ParticipantSessionRepository
  ) {}

  private async getAuthorizedParticipant(context: MediaSessionContext): Promise<ParticipantState> {
    if (!this.participants || !this.participantSessions) {
      throw new MediaControlError(
        'MEDIA_UNAUTHORIZED',
        'Media authorization dependencies are not configured.'
      );
    }

    const participant = await this.participants.findById(context.participantId);
    if (
      !participant ||
      participant.roomSessionId !== context.roomSessionId ||
      participant.status !== 'CONNECTED'
    ) {
      throw new MediaControlError(
        'MEDIA_UNAUTHORIZED',
        'Participant is not authorized for this media session.'
      );
    }

    const session = await this.participantSessions.findById(context.participantSessionId);
    if (
      !session ||
      session.participantId !== participant.id ||
      session.connectionId !== context.connectionId ||
      session.disconnectedAt !== null ||
      session.intentionalLeave
    ) {
      throw new MediaControlError(
        'MEDIA_SESSION_INVALID',
        'Media session does not belong to the current realtime connection.'
      );
    }

    return participant;
  }

  async getAudioState(context: MediaSessionContext): Promise<MediaAudioState> {
    const participant = await this.getAuthorizedParticipant(context);
    return {
      audioRole: participant.audioRole,
      selfMuted: participant.selfMuted,
      moderatorMuted: participant.moderatorMuted,
      canTransmitAudio: canTransmitAudio(participant),
    };
  }

  async createTransport(context: MediaSessionContext, payload: unknown) {
    const parsed = createTransportSchema.safeParse(payload);
    if (!parsed.success || !parsed.data.direction) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid transport creation payload.');
    }

    const participant = await this.getAuthorizedParticipant(context);

    if (parsed.data.direction === 'send' && !canTransmitAudio(participant)) {
      throw new MediaControlError(
        'MEDIA_UNAUTHORIZED',
        'Participant is not currently authorized to transmit audio.'
      );
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
    const command: ConnectTransportCommand = {
      transportId: parsed.data.transportId as ConnectTransportCommand['transportId'],
      participantId: context.participantId,
      participantSessionId: context.participantSessionId,
      connectionId: context.connectionId,
      dtlsParameters: parsed.data.dtlsParameters,
    };
    await this.media.connectWebRtcTransport(command);
  }

  async produceAudio(context: MediaSessionContext, payload: unknown) {
    const parsed = produceAudioSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid audio producer payload.');
    }

    const participant = await this.getAuthorizedParticipant(context);
    if (!canTransmitAudio(participant)) {
      throw new MediaControlError(
        'MEDIA_UNAUTHORIZED',
        'Participant is not currently authorized to produce audio.'
      );
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

    const command: ProduceAudioCommand = {
      transportId: parsed.data.transportId as ProduceAudioCommand['transportId'],
      kind: parsed.data.kind,
      rtpParameters: parsed.data.rtpParameters,
      appData: {
        participantId: context.participantId,
        participantSessionId: context.participantSessionId,
        connectionId: context.connectionId,
      },
    };
    const result = await this.media.produceAudio(command);

    if (this.events) {
      await this.events.publish({
        type: 'media.audio.producer.created',
        occurredAt: this.now(),
        roomId: context.roomId,
        roomSessionId: context.roomSessionId,
        participantId: context.participantId,
        participantSessionId: context.participantSessionId,
        payload: { producerId: result.producerId, kind: 'audio' },
      } as DomainEvent);
    }

    return result;
  }

  async listAudioProducers(context: MediaSessionContext) {
    await this.getAuthorizedParticipant(context);
    return this.media.listAudioProducers(context);
  }

  async consumeAudio(context: MediaSessionContext, payload: unknown) {
    const parsed = consumeAudioSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MediaControlError('INVALID_MEDIA_COMMAND', 'Invalid audio consumer payload.');
    }

    await this.getAuthorizedParticipant(context);

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

    const command: ConsumeAudioCommand = {
      roomId: context.roomId,
      participantId: context.participantId,
      participantSessionId: context.participantSessionId,
      connectionId: context.connectionId,
      producerId: parsed.data.producerId as ConsumeAudioCommand['producerId'],
      rtpCapabilities: parsed.data.rtpCapabilities,
    };
    return this.media.consumeAudio(command);
  }

  async revokeAudioProduction(context: MediaSessionContext): Promise<void> {
    await this.getAuthorizedParticipant(context);
    await this.media.revokeAudioProduction(context);
  }

  closeParticipant(context: MediaSessionContext) {
    return this.media.closeParticipantMedia(context);
  }
}
