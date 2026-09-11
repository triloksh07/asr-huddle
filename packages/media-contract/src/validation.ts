import { z } from 'zod';

export const createTransportSchema = z.object({
  direction: z.enum(['send', 'recv']),
});
export const connectTransportSchema = z.object({
  transportId: z.string().min(1),
  dtlsParameters: z.unknown(),
});
export const produceAudioSchema = z.object({
  transportId: z.string().min(1),
  kind: z.literal('audio'),
  rtpParameters: z.unknown(),
  appData: z.object({ participantId: z.string().min(1), participantSessionId: z.string().min(1) }),
});
export const consumeAudioSchema = z.object({
  roomId: z.string().min(1),
  participantId: z.string().min(1),
  participantSessionId: z.string().min(1),
  producerId: z.string().min(1),
  rtpCapabilities: z.object({
    codecs: z.array(z.unknown()),
    headerExtensions: z.array(z.unknown()).optional(),
  }),
});
