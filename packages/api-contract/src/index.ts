import { z } from "zod";

export const roomIdSchema = z.string().min(1);
export const participantIdSchema = z.string().min(1);
export const participantSessionIdSchema = z.string().min(1);
export const invitationIdSchema = z.string().min(1);
export const requestIdSchema = z.string().min(1);

export const roomVisibilitySchema = z.enum(["PUBLIC", "LINK_ONLY"]);
export const roomDurationMinutesSchema = z.union([
  z.literal(60),
  z.literal(120),
  z.literal(300),
]);

export const reactionTypeSchema = z.enum([
  "😅",
  "🥲",
  "😂",
  "👍",
  "👏",
  "👋",
  "😏",
  "🙂",
  "🔥",
  "👀",
  "🥀",
  "❤️",
  "💯",
]);

/**
 * Public HTTP request schemas.
 *
 * These are intentionally transport schemas: authentication headers/cookies
 * remain transport concerns and are not represented as JSON body fields.
 */
export const registerRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(12).max(128),
});

export const loginRequestSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const createRoomRequestSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(500),
  visibility: roomVisibilitySchema,
  durationMinutes: roomDurationMinutesSchema,
});

export const authUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
});

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: authUserSchema,
});

export const errorResponseSchema = z.object({
  error: z.string().min(1),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export const emptyObjectSchema = z.object({});

export const roomStateSchema = z.object({
  id: roomIdSchema,
  hostUserId: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: roomVisibilitySchema,
  durationMinutes: roomDurationMinutesSchema,
  status: z.enum(["ACTIVE", "ENDED"]),
  createdAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
});

export const roomSessionStateSchema = z.object({
  id: z.string().min(1),
  roomId: roomIdSchema,
  startedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: z.enum(["ACTIVE", "ENDED"]),
  expiryWarningIssuedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
});

export const participantSnapshotSchema = z.object({
  id: participantIdSchema,
  userId: z.string().min(1),
  managementRole: z.enum(["HOST", "CO_HOST"]),
  audioRole: z.enum(["SPEAKER", "LISTENER"]),
  status: z.enum(["CONNECTED", "DISCONNECTED", "LEFT", "REMOVED"]),
  handRaised: z.boolean(),
});

export const roomSnapshotSchema = z.object({
  room: roomStateSchema,
  session: roomSessionStateSchema,
  participants: z.array(participantSnapshotSchema),
});

/**
 * Public realtime command payload schemas.
 * The command names are the active runtime names at 98e7bbd.
 */
export const realtimeCommandPayloadSchemas = {
  "room.join": z.object({ roomId: roomIdSchema }),
  "room.leave": emptyObjectSchema,
  "room.end": emptyObjectSchema,
  "room.reconnect": z.object({
    roomId: roomIdSchema,
    participantId: participantIdSchema,
    participantSessionId: participantSessionIdSchema,
  }),

  "media.audio.state": emptyObjectSchema,
  "media.transport.create": z.record(z.string(), z.unknown()),
  "media.transport.connect": z.record(z.string(), z.unknown()),
  "media.audio.produce": z.record(z.string(), z.unknown()),
  "media.audio.producers": emptyObjectSchema,
  "media.audio.consume": z.record(z.string(), z.unknown()),

  "speaker.request": emptyObjectSchema,
  "speaker.request.cancel": z.object({ requestId: requestIdSchema }),
  "speaker.request.approve": z.object({ requestId: requestIdSchema }),
  "speaker.request.deny": z.object({ requestId: requestIdSchema }),
  "speaker.invite": z.object({ targetParticipantId: participantIdSchema }),
  "speaker.invite.respond": z.object({
    invitationId: invitationIdSchema,
    accept: z.boolean(),
  }),
  "speaker.demote": z.object({ targetParticipantId: participantIdSchema }),

  "moderation.mute": z.object({ targetParticipantId: participantIdSchema }),
  "moderation.unmute": z.object({ targetParticipantId: participantIdSchema }),
  "moderation.self-mute": z.object({ muted: z.boolean() }),
  "moderation.cohost.promote": z.object({
    targetParticipantId: participantIdSchema,
  }),
  "moderation.cohost.demote": z.object({
    targetParticipantId: participantIdSchema,
  }),
  "moderation.remove": z.object({ targetParticipantId: participantIdSchema }),

  "speaker.hand": z.object({ raised: z.boolean() }),
  "room.reaction": z.object({ type: reactionTypeSchema }),
} as const;

export type RealtimeCommandType = keyof typeof realtimeCommandPayloadSchemas;

export const realtimeCommandEnvelopeBaseSchema = z.object({
  requestId: requestIdSchema,
  type: z.string().min(1),
  payload: z.unknown(),
});

export const realtimeResponseErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const realtimeResponseEnvelopeBaseSchema = z.object({
  requestId: requestIdSchema,
  type: z.string().min(1),
  ok: z.boolean(),
});

export const realtimeEventEnvelopeBaseSchema = z.object({
  eventId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  type: z.string().min(1),
  occurredAt: z.string().datetime(),
  roomId: roomIdSchema,
  payload: z.unknown(),
});

/**
 * Build an exact command envelope schema for a named command.
 */
export function realtimeCommandSchema<T extends RealtimeCommandType>(type: T) {
  return z.object({
    requestId: requestIdSchema,
    type: z.literal(type),
    payload: realtimeCommandPayloadSchemas[type],
  });
}

/**
 * Response envelope factory. A command-specific result schema is supplied by
 * the owning adapter once that result has been formally extracted.
 */
export function realtimeSuccessSchema<T extends z.ZodTypeAny>(result: T) {
  return z.object({
    requestId: requestIdSchema,
    type: z.string().min(1),
    ok: z.literal(true),
    payload: result,
  });
}

export function realtimeFailureSchema() {
  return z.object({
    requestId: requestIdSchema,
    type: z.string().min(1),
    ok: z.literal(false),
    error: realtimeResponseErrorSchema,
  });
}

export const publicRealtimeCommandTypes = Object.keys(
  realtimeCommandPayloadSchemas,
) as RealtimeCommandType[];
