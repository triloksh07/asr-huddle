import {
  markDisconnected,
  markSessionDisconnected,
} from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
} from "../ports.js";

export interface DisconnectRoomCommand {
  readonly participantId: string;
  readonly participantSessionId: string;
  readonly recoverableForMs: number;
}

export class DisconnectRoom {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly participantSessions: ParticipantSessionRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
  ) {}

  async execute(command: DisconnectRoomCommand): Promise<void> {
    const participant = await this.participants.findById(command.participantId);
    if (!participant) {
      throw new ApplicationError("NOT_FOUND", "Participant was not found.");
    }

    const session = await this.participantSessions.findById(
      command.participantSessionId,
    );

    if (!session) {
      throw new ApplicationError(
        "NOT_FOUND",
        "Participant session was not found.",
      );
    }

    if (session.participantId !== participant.id) {
      throw new ApplicationError(
        "INVALID_STATE",
        "Participant session does not belong to the participant.",
      );
    }

    const now = this.clock.now();
    const recoverableUntil = new Date(
      now.getTime() + command.recoverableForMs,
    );

    await this.participants.save(markDisconnected(participant, now));
    await this.participantSessions.save(
      markSessionDisconnected(session, now, recoverableUntil),
    );

    await this.events.publish({
      type: "participant.disconnected",
      occurredAt: now,
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: session.id,
      userId: participant.userId,
      payload: {
        participantId: participant.id,
        participantSessionId: session.id,
        recoverableUntil: recoverableUntil.toISOString(),
      },
    });
  }
}
