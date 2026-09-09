import { z } from "zod";
import type { ActiveParticipantState, ActiveRoomState, SpeakerRequestState } from "./types.js";

const activeRoomSchema = z.object({
  roomId: z.string(),
  roomSessionId: z.string(),
  status: z.enum(["ACTIVE", "ENDING"]),
  expiresAt: z.string(),
  expiryWarningAt: z.string(),
  hostParticipantId: z.string().nullable(),
  hostUserId: z.string().nullable(),
  version: z.number().int().nonnegative(),
});

const activeParticipantSchema = z.object({
  participantId: z.string(),
  roomId: z.string(),
  roomSessionId: z.string(),
  participantSessionId: z.string(),
  userId: z.string(),
  managementRole: z.enum(["HOST", "CO_HOST", "NONE"]),
  audioRole: z.enum(["SPEAKER", "LISTENER"]),
  status: z.enum(["CONNECTED", "DISCONNECTED", "LEFT", "REMOVED"]),
  connectionId: z.string().nullable(),
  connectedAt: z.string(),
  disconnectedAt: z.string().nullable(),
  recoverableUntil: z.string().nullable(),
  version: z.number().int().nonnegative(),
});

const speakerRequestSchema = z.object({
  requestId: z.string(),
  roomId: z.string(),
  participantId: z.string(),
  userId: z.string(),
  state: z.enum(["PENDING", "APPROVED", "DENIED", "CANCELLED", "EXPIRED"]),
  requestedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

export function decodeActiveRoom(raw: string): ActiveRoomState {
  return activeRoomSchema.parse(JSON.parse(raw)) as ActiveRoomState;
}

export function decodeActiveParticipant(raw: string): ActiveParticipantState {
  return activeParticipantSchema.parse(JSON.parse(raw)) as ActiveParticipantState;
}

export function decodeSpeakerRequest(raw: string): SpeakerRequestState {
  return speakerRequestSchema.parse(JSON.parse(raw)) as SpeakerRequestState;
}
