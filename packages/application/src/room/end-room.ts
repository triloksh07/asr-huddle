import { endRoom, endRoomSession } from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  EventPublisher,
  RoomRepository,
  RoomSessionRepository,
} from "../ports.js";

export interface EndRoomCommand {
  readonly roomId: string;
}

export class EndRoom {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
  ) {}

  async execute(command: EndRoomCommand): Promise<void> {
    const room = await this.rooms.findById(command.roomId);
    if (!room) {
      throw new ApplicationError("NOT_FOUND", "Room was not found.");
    }

    const session = await this.sessions.findActiveByRoomId(command.roomId);
    if (!session) {
      const ended = endRoom(room, this.clock.now());
      await this.rooms.save(ended);
      return;
    }

    const endedAt = this.clock.now();
    const endedRoom = endRoom(room, endedAt);
    const endedSession = endRoomSession(session, endedAt);

    await this.rooms.save(endedRoom);
    await this.sessions.save(endedSession);

    await this.events.publish({
      type: "room.ended",
      occurredAt: endedAt,
      roomId: command.roomId,
      roomSessionId: session.id,
    });
  }
}
