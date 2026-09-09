import {
  assertCanAddListener,
  assertRoomSessionActive,
  createParticipant,
} from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  IdGenerator,
  ParticipantRepository,
  RoomRepository,
  RoomSessionRepository,
  UserRepository,
} from "../ports.js";

export interface JoinRoomCommand {
  readonly roomId: string;
  readonly userId: string;
}

export class JoinRoom {
  constructor(
    private readonly users: UserRepository,
    private readonly rooms: RoomRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly participants: ParticipantRepository,
    private readonly ids: IdGenerator,
    private readonly clock: ApplicationClock,
  ) {}

  async execute(command: JoinRoomCommand) {
    const user = await this.users.findById(command.userId);
    if (!user) {
      throw new ApplicationError("UNAUTHENTICATED", "Authenticated user was not found.");
    }

    const room = await this.rooms.findById(command.roomId);
    if (!room) {
      throw new ApplicationError("NOT_FOUND", "Room was not found.");
    }

    const session = await this.sessions.findActiveByRoomId(command.roomId);
    if (!session) {
      throw new ApplicationError("ROOM_ENDED", "The room is not active.");
    }

    assertRoomSessionActive(session);

    const existing = await this.participants.findByRoomSession(session.id);
    const listenerCount = existing.filter(
      (participant) =>
        participant.audioRole === "LISTENER" &&
        participant.status === "CONNECTED",
    ).length;
    const speakerCount = existing.filter(
      (participant) =>
        participant.audioRole === "SPEAKER" &&
        participant.status === "CONNECTED",
    ).length;
    const coHostCount = existing.filter(
      (participant) =>
        participant.managementRole === "CO_HOST" &&
        participant.status === "CONNECTED",
    ).length;

    assertCanAddListener({
      listeners: listenerCount,
      speakers: speakerCount,
      coHosts: coHostCount,
    });

    const participant = createParticipant({
      id: this.ids.next() as ReturnType<typeof createParticipant>["id"],
      roomId: room.id,
      roomSessionId: session.id,
      userId: user.id as ReturnType<typeof createParticipant>["userId"],
      joinedAt: this.clock.now(),
    });

    await this.participants.save(participant);
    return participant;
  }
}
