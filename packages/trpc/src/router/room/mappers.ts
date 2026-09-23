import type { RoomEndOutput, RoomState } from '../../schemas/room.js';

interface RoomLike {
  id: string;
  hostUserId: string;
  title: string;
  description: string;
  visibility: 'PUBLIC' | 'LINK_ONLY';
  durationMinutes: 60 | 120 | 300;
  status: 'ACTIVE' | 'ENDED';
  createdAt: Date;
  endedAt: Date | null;
}

interface RoomSessionLike {
  id: string;
  roomId: string;
  startedAt: Date;
  expiresAt: Date;
  status: 'ACTIVE' | 'ENDED';
  expiryWarningIssuedAt: Date | null;
  endedAt: Date | null;
}

interface CreateRoomResultLike {
  room: RoomLike;
  session: RoomSessionLike;
}

export function toRoomDto(room: RoomLike): RoomState {
  return {
    id: room.id,
    hostUserId: room.hostUserId,
    title: room.title,
    description: room.description,
    visibility: room.visibility,
    durationMinutes: room.durationMinutes,
    status: room.status,
    createdAt: room.createdAt,
    endedAt: room.endedAt,
  };
}

export function toRoomSessionDto(session: RoomSessionLike) {
  return {
    id: session.id,
    roomId: session.roomId,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    status: session.status,
    expiryWarningIssuedAt: session.expiryWarningIssuedAt,
    endedAt: session.endedAt,
  };
}

export function toCreateRoomDto(result: CreateRoomResultLike) {
  return {
    room: toRoomDto(result.room),
    session: toRoomSessionDto(result.session),
  };
}

export function toRoomEndDto(result: {
  status: 'ENDED' | 'ALREADY_ENDED';
  roomId: string;
}): RoomEndOutput {
  return {
    roomId: result.roomId,
    status: result.status,
  };
}
