import { z } from 'zod';
import {
  roomDurationMinutesSchema,
  roomIdSchema,
  roomVisibilitySchema,
} from './common.js';

export const createRoomInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  visibility: roomVisibilitySchema,
  durationMinutes: roomDurationMinutesSchema,
});

export const roomIdInputSchema = z.object({
  roomId: roomIdSchema,
});

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type RoomIdInput = z.infer<typeof roomIdInputSchema>;
