import { z } from 'zod';

const identity = z.object({
  roomId: z.string().min(1),
  roomSessionId: z.string().min(1),
});

export const createRouterSchema = identity;
export const closeRoomSchema = identity;

export const joinMediaContextSchema = identity.extend({
  participantId: z.string().min(1),
  participantSessionId: z.string().min(1),
  connectionId: z.string().min(1),
});

export const closeParticipantMediaSchema = identity.extend({
  participantId: z.string().min(1),
  participantSessionId: z.string().min(1),
});

export const createTransportSchema = joinMediaContextSchema.extend({
  direction: z.enum(['send', 'recv']).optional(),
});

export const connectTransportSchema = z.object({
  transportId: z.string().min(1),
  participantId: z.string().min(1),
  participantSessionId: z.string().min(1),
  connectionId: z.string().min(1),
  dtlsParameters: z.unknown(),
});

export const produceAudioSchema = z.object({
  transportId: z.string().min(1),
  kind: z.literal('audio'),
  rtpParameters: z.unknown(),
  appData: z.object({
    participantId: z.string().min(1),
    participantSessionId: z.string().min(1),
    connectionId: z.string().min(1),
  }),
});

export const consumeAudioSchema = z.object({
  roomId: z.string().min(1),
  participantId: z.string().min(1),
  participantSessionId: z.string().min(1),
  connectionId: z.string().min(1),
  producerId: z.string().min(1),
  rtpCapabilities: z.object({
    codecs: z.array(z.unknown()),
    headerExtensions: z.array(z.unknown()).optional(),
  }),
});

export const mediaRpcParamsSchemas = {
  'media.createRouter': createRouterSchema,
  'media.createTransport': createTransportSchema,
  'media.connectTransport': connectTransportSchema,
  'media.produceAudio': produceAudioSchema,
  'media.consumeAudio': consumeAudioSchema,
  'media.listAudioProducers': joinMediaContextSchema,
  'media.revokeAudioProduction': joinMediaContextSchema,
  'media.closeParticipant': closeParticipantMediaSchema,
  'media.closeRoom': closeRoomSchema,
} as const;

export const mediaRpcMethodSchema = z.enum([
  'media.createRouter',
  'media.createTransport',
  'media.connectTransport',
  'media.produceAudio',
  'media.consumeAudio',
  'media.listAudioProducers',
  'media.revokeAudioProduction',
  'media.closeParticipant',
  'media.closeRoom',
]);
