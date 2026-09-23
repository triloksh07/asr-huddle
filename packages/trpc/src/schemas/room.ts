import { z } from 'zod';
import { roomDurationMinutesSchema, roomIdSchema, roomVisibilitySchema } from './common.js';

const roomDtoSchema = z.object({
  id: z.string().min(1),
  hostUserId: z.string().min(1),
  title: z.string(),
  description: z.string(),
  visibility: roomVisibilitySchema,
  durationMinutes: roomDurationMinutesSchema,
  status: z.enum(['ACTIVE', 'ENDED']),
  createdAt: z.date(),
  endedAt: z.date().nullable(),
});

const roomSessionDtoSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  startedAt: z.date(),
  expiresAt: z.date(),
  status: z.enum(['ACTIVE', 'ENDED']),
  expiryWarningIssuedAt: z.date().nullable(),
  endedAt: z.date().nullable(),
});

const createRoomDtoSchema = z.object({
  room: roomDtoSchema,
  session: roomSessionDtoSchema,
  // room: roomDtoSchema.omit({ endedAt: true }),
  // session: roomSessionDtoSchema.omit({ expiryWarningIssuedAt: true, endedAt: true }),
});

export const createRoomInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  visibility: roomVisibilitySchema,
  durationMinutes: roomDurationMinutesSchema,
});

export const roomIdInputSchema = z.object({ roomId: roomIdSchema });

export const roomStateOutputSchema = roomDtoSchema;

export const createRoomOutputSchema = createRoomDtoSchema;

export const roomListOutputSchema = z.array(roomDtoSchema);

export const roomEndOutputSchema = z.discriminatedUnion('status', [
  z.object({
    roomId: roomIdSchema,
    status: z.literal('ENDED'),
  }),
  z.object({
    roomId: roomIdSchema,
    status: z.literal('ALREADY_ENDED'),
  }),
]);

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type RoomIdInput = z.infer<typeof roomIdInputSchema>;
export type RoomState = z.infer<typeof roomDtoSchema>;
export type CreateRoomOutput = z.infer<typeof createRoomOutputSchema>;
export type RoomListOutput = z.infer<typeof roomListOutputSchema>;
export type RoomEndOutput = z.infer<typeof roomEndOutputSchema>;
