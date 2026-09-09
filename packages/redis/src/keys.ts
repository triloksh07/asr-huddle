import type {
  ConnectionId,
  ParticipantId,
  ParticipantSessionId,
  RoomId,
  RoomSessionId,
  SpeakerRequestId,
} from '@repo/domain';

const prefix = 'asr:v1';

export const activeStateKeys = {
  room: (roomId: RoomId) => `${prefix}:room:${roomId}:state`,
  roomSession: (roomSessionId: RoomSessionId) => `${prefix}:room-session:${roomSessionId}:state`,
  participants: (roomId: RoomId) => `${prefix}:room:${roomId}:participants`,
  participant: (participantId: ParticipantId) => `${prefix}:participant:${participantId}:state`,
  participantSession: (sessionId: ParticipantSessionId) =>
    `${prefix}:participant-session:${sessionId}:state`,
  connection: (connectionId: ConnectionId) => `${prefix}:connection:${connectionId}:state`,
  participantConnection: (participantId: ParticipantId) =>
    `${prefix}:participant:${participantId}:connection`,
  reconnect: (participantSessionId: ParticipantSessionId) =>
    `${prefix}:participant-session:${participantSessionId}:reconnect`,
  speakerRequest: (roomId: RoomId, requestId: SpeakerRequestId) =>
    `${prefix}:room:${roomId}:speaker-request:${requestId}`,
  pendingSpeakerRequests: (roomId: RoomId) => `${prefix}:room:${roomId}:speaker-requests:pending`,
  roomExpiry: (roomId: RoomId) => `${prefix}:room:${roomId}:expiry`,
  lock: (name: string) => `${prefix}:lock:${name}`,
  eventSequence: (roomId: RoomId) => `${prefix}:room:${roomId}:event-seq`,
} as const;
