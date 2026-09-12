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
  Transaction,
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
    private readonly transaction: Transaction,
    private readonly ids: IdGenerator,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
  ) {}

  async execute(command: JoinRoomCommand): Promise<JoinRoomResult> {
    const now = this.clock.now();

    const result = await this.transaction.run(async ({
      users,
      rooms,
      roomSessions,
      participants,
      participantSessions,
    }) => {
      const user = await users.findById(command.userId);
      if (!user) {
        throw new ApplicationError(
          "UNAUTHENTICATED",
          "Authenticated user was not found.",
        );
      }

      const room = await rooms.findById(command.roomId);
      if (!room) {
        throw new ApplicationError("NOT_FOUND", "Room was not found.");
      }

      const session = await roomSessions.findActiveByRoomId(command.roomId);
      if (!session) {
        throw new ApplicationError("ROOM_ENDED", "The room is not active.");
      }

      assertRoomSessionActive(session);

      const existing = await participants.findByRoomSession(session.id);
      const existingUserParticipant = existing.find(
        (participant) =>
          participant.userId === user.id && participant.status === "CONNECTED",
      );

      if (existingUserParticipant) {
        const activeSession =
          await participantSessions.findActiveByParticipantId(
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
              userId: user.id as ReturnType<
                typeof createParticipant
              >["userId"],
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

      await participants.save(participant);
      await participantSessions.save(participantSession);

      return {
        roomId: participant.roomId,
        roomSessionId: participant.roomSessionId,
        participantId: participant.id,
        participantSessionId: participantSession.id,
        managementRole: participant.managementRole,
        audioRole: participant.audioRole,
        userId: participant.userId,
      };
    });

    const publicResult: JoinRoomResult = {
      roomId: result.roomId,
      roomSessionId: result.roomSessionId,
      participantId: result.participantId,
      participantSessionId: result.participantSessionId,
      managementRole: result.managementRole,
      audioRole: result.audioRole,
    };

    await this.events.publish({
      type: "participant.joined",
      occurredAt: now,
      roomId: publicResult.roomId,
      roomSessionId: publicResult.roomSessionId,
      participantId: publicResult.participantId,
      participantSessionId: publicResult.participantSessionId,
      userId: result.userId,
      payload: publicResult,
    });

    return publicResult;
  }
}
