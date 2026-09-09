import { ApplicationError } from "../errors.js";
import type {
  ParticipantRepository,
  RoomRepository,
  RoomSessionRepository,
  RoomSnapshot,
} from "../ports.js";

export interface GetRoomSnapshotCommand {
  readonly roomId: string;
}

export class GetRoomSnapshot {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly participants: ParticipantRepository,
  ) {}

  async execute(command: GetRoomSnapshotCommand): Promise<RoomSnapshot> {
    const room = await this.rooms.findById(command.roomId);
    if (!room) {
      throw new ApplicationError("NOT_FOUND", "Room was not found.");
    }

    const session = await this.sessions.findActiveByRoomId(command.roomId);
    if (!session) {
      throw new ApplicationError("ROOM_ENDED", "The room has no active session.");
    }

    const participants = await this.participants.findByRoomSession(session.id);

    return {
      room,
      session,
      participants: participants.map((participant) => ({
        id: participant.id,
        userId: participant.userId,
        managementRole: participant.managementRole,
        audioRole: participant.audioRole,
        status: participant.status,
      })),
    };
  }
}
