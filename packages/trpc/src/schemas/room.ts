import { z } from 'zod';
import { roomDurationMinutesSchema, roomIdSchema, roomVisibilitySchema } from './common.js';

const roomStateSchema = z.object({
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

const roomSessionStateSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  startedAt: z.date(),
  expiresAt: z.date(),
  status: z.enum(['ACTIVE', 'ENDED']),
  expiryWarningIssuedAt: z.date().nullable(),
  endedAt: z.date().nullable(),
});

export const createRoomInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  visibility: roomVisibilitySchema,
  durationMinutes: roomDurationMinutesSchema,
});

export const roomIdInputSchema = z.object({
  roomId: roomIdSchema,
});

export const roomStateOutputSchema = roomStateSchema;

export const createRoomOutputSchema = z.object({
  room: roomStateSchema,
  session: roomSessionStateSchema,
});

export const roomListOutputSchema = z.array(roomStateSchema);

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type RoomIdInput = z.infer<typeof roomIdInputSchema>;
export type RoomState = z.infer<typeof roomStateSchema>;
export type CreateRoomOutput = z.infer<typeof createRoomOutputSchema>;
export type RoomListOutput = z.infer<typeof roomListOutputSchema>;
