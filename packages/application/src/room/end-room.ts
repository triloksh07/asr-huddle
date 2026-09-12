import { endRoom, endRoomSession } from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  EventPublisher,
  Transaction,
} from "../ports.js";

export interface EndRoomCommand {
  readonly roomId: string;
  readonly reason?: "HOST_ENDED" | "EXPIRY" | "EMPTY";
}

export class EndRoom {
  constructor(
    private readonly transaction: Transaction,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
  ) {}

  async execute(command: EndRoomCommand): Promise<void> {
    let eventSessionId: string | undefined;
    const endedAt = this.clock.now();

    const ended = await this.transaction.run(async ({ rooms, roomSessions }) => {
      const room = await rooms.findById(command.roomId);
      if (!room) {
        throw new ApplicationError("NOT_FOUND", "Room was not found.");
      }

      const session = await roomSessions.findActiveByRoomId(command.roomId);
      if (!session) {
        return { changed: false as const };
      }

      const endedRoom = endRoom(room, endedAt);
      const endedSession = endRoomSession(session, endedAt);
      await rooms.save(endedRoom);
      await roomSessions.save(endedSession);
      eventSessionId = session.id;
      return { changed: true as const };
    });

    if (!ended.changed) {
      return;
    }

    await this.events.publish({
      type: "room.ended",
      occurredAt: endedAt,
      roomId: command.roomId,
      roomSessionId: eventSessionId,
      payload: { reason: command.reason ?? "HOST_ENDED" },
    });
  }
}
