import {
  createRoom,
  createRoomSession,
  type RoomDurationMinutes,
  type RoomVisibility,
} from "@repo/domain";
import type {
  ApplicationClock,
  IdGenerator,
  RoomRepository,
  RoomSessionRepository,
} from "../ports.js";

export interface CreateRoomCommand {
  readonly userId: string;
  readonly title: string;
  readonly description: string;
  readonly visibility: RoomVisibility;
  readonly durationMinutes: RoomDurationMinutes;
}

export interface CreateRoomResult {
  readonly room: ReturnType<typeof createRoom>;
  readonly session: ReturnType<typeof createRoomSession>;
}

export class CreateRoom {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: ApplicationClock,
  ) {}

  async execute(command: CreateRoomCommand): Promise<CreateRoomResult> {
    const now = this.clock.now();
    const room = createRoom({
      id: this.ids.next() as ReturnType<typeof createRoom>["id"],
      hostUserId: command.userId as ReturnType<typeof createRoom>["hostUserId"],
      title: command.title,
      description: command.description,
      visibility: command.visibility,
      durationMinutes: command.durationMinutes,
      createdAt: now,
    });

    const session = createRoomSession({
      id: this.ids.next() as ReturnType<typeof createRoomSession>["id"],
      room,
      startedAt: now,
    });

    await this.rooms.save(room);
    await this.sessions.save(session);

    return { room, session };
  }
}
