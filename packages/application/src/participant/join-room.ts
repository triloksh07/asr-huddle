import {
  assertCanAddListener,
  assertRoomSessionActive,
  createHostParticipant,
  createParticipant,
  createParticipantSession,
  type ConnectionId,
} from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  EventPublisher,
  IdGenerator,
  ParticipantRepository,
  ParticipantSessionRepository,
  RoomRepository,
  RoomSessionRepository,
  UserRepository,
} from "../ports.js";

export interface JoinRoomCommand {
  readonly roomId: string;
  readonly userId: string;
  readonly connectionId: ConnectionId;
}

export interface JoinRoomResult {
  readonly roomId: string;
  readonly roomSessionId: string;
  readonly participantId: string;
  readonly participantSessionId: string;
  readonly managementRole: "HOST" | "CO_HOST" | "NONE";
  readonly audioRole: "SPEAKER" | "LISTENER";
}

export class JoinRoom {
  constructor(
    private readonly users: UserRepository,
    private readonly rooms: RoomRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly participants: ParticipantRepository,
    private readonly participantSessions: ParticipantSessionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: ApplicationClock,
    private readonly events?: EventPublisher,
  ) {}

  async execute(command: JoinRoomCommand): Promise<JoinRoomResult> {
    const user = await this.users.findById(command.userId);
    if (!user) {
      throw new ApplicationError(
        "UNAUTHENTICATED",
        "Authenticated user was not found.",
      );
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
    const existingUserParticipant = existing.find(
      (participant) =>
        participant.userId === user.id && participant.status === "CONNECTED",
    );

    if (existingUserParticipant) {
      const activeSession =
        await this.participantSessions.findActiveByParticipantId(
          existingUserParticipant.id,
        );

      if (activeSession) {
        throw new ApplicationError(
          "CONFLICT",
          "This user already has an active session in the room.",
        );
      }
    }

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

    const now = this.clock.now();
    const participant =
      room.hostUserId === user.id
        ? createHostParticipant({
            id: this.ids.next() as ReturnType<
              typeof createHostParticipant
            >["id"],
            roomId: room.id,
            roomSessionId: session.id,
            userId: user.id as ReturnType<
              typeof createHostParticipant
            >["userId"],
            joinedAt: now,
          })
        : createParticipant({
            id: this.ids.next() as ReturnType<typeof createParticipant>["id"],
            roomId: room.id,
            roomSessionId: session.id,
            userId: user.id as ReturnType<typeof createParticipant>["userId"],
            joinedAt: now,
          });

    const participantSession = createParticipantSession({
      id: this.ids.next() as ReturnType<
        typeof createParticipantSession
      >["id"],
      participantId: participant.id,
      connectionId: command.connectionId,
      connectedAt: now,
    });

    await this.participants.save(participant);
    await this.participantSessions.save(participantSession);

    const result: JoinRoomResult = {
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: participantSession.id,
      managementRole: participant.managementRole,
      audioRole: participant.audioRole,
    };

    await this.events!.publish({
      type: "participant.joined",
      occurredAt: now,
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: participantSession.id,
      userId: participant.userId,
      payload: result,
    });

    return result;
  }
}
