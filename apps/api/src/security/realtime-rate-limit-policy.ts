import type { ApiConfig } from '../config.js';
import type { RealtimeConnection, RealtimeEnvelope } from '../realtime/types.js';
import type { RateLimitRule } from './rate-limiter.js';

export interface RealtimeRateLimitCheck {
  readonly scope: string;
  readonly identifier: string;
  readonly rule: RateLimitRule;
}

function reactionTypeFromPayload(payload: unknown): string | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('type' in payload) ||
    typeof payload.type !== 'string'
  ) {
    return null;
  }

  return payload.type;
}

export class RealtimeRateLimitPolicy {
  constructor(private readonly config: ApiConfig['rateLimits']) {}

  checks(
    connection: RealtimeConnection,
    envelope: RealtimeEnvelope
  ): readonly RealtimeRateLimitCheck[] {
    const checks: RealtimeRateLimitCheck[] = [];
    const isSessionCommand = envelope.type === 'room.join' || envelope.type === 'room.reconnect';
    const isSpeakerRequestCommand = envelope.type === 'speaker.request';
    const isReactionCommand = envelope.type === 'room.reaction';
    const isMediaCommand = envelope.type.startsWith('media.');

    if (isSessionCommand || isSpeakerRequestCommand || isReactionCommand || isMediaCommand) {
      checks.push({
        scope: 'realtime.command.connection',
        identifier: connection.connectionId,
        rule: {
          limit: this.config.commandLimit,
          windowMs: this.config.commandWindowMs,
        },
      });
    }

    switch (envelope.type) {
      case 'room.join':
      case 'room.reconnect':
        checks.push({
          scope: 'realtime.session.user',
          identifier: connection.userId,
          rule: {
            limit: this.config.sessionLimit,
            windowMs: this.config.sessionWindowMs,
          },
        });
        break;

      case 'speaker.request':
        checks.push({
          scope: 'realtime.speaker-request.user',
          identifier: this.roomScopedIdentifier(connection, envelope),
          rule: {
            limit: this.config.speakerRequestLimit,
            windowMs: this.config.speakerRequestWindowMs,
          },
        });
        break;

      case 'room.reaction': {
        const roomScopedIdentifier = this.roomScopedIdentifier(connection, envelope);
        checks.push({
          scope: 'realtime.reaction.user',
          identifier: roomScopedIdentifier,
          rule: {
            limit: this.config.reactionBurstLimit,
            windowMs: this.config.reactionBurstWindowMs,
          },
        });

        const reactionType = reactionTypeFromPayload(envelope.payload);
        if (reactionType) {
          checks.push({
            scope: 'realtime.reaction.type',
            identifier: `${roomScopedIdentifier}:${reactionType}`,
            rule: {
              limit: 1,
              windowMs: this.config.reactionSameTypeWindowMs,
            },
          });
        }
        break;
      }

      default:
        break;
    }

    if (envelope.type.startsWith('media.')) {
      checks.push({
        scope: 'realtime.media.connection',
        identifier: connection.connectionId,
        rule: {
          limit: this.config.mediaLimit,
          windowMs: this.config.mediaWindowMs,
        },
      });
    }

    return checks;
  }

  private roomScopedIdentifier(connection: RealtimeConnection, envelope: RealtimeEnvelope): string {
    return `${connection.userId}:${connection.roomId ?? this.roomIdFromPayload(envelope) ?? 'unbound'}`;
  }

  private roomIdFromPayload(envelope: RealtimeEnvelope): string | null {
    if (
      typeof envelope.payload !== 'object' ||
      envelope.payload === null ||
      !('roomId' in envelope.payload) ||
      typeof envelope.payload.roomId !== 'string'
    ) {
      return null;
    }

    return envelope.payload.roomId;
  }
}
