import {
  markLeft,
  markSessionDisconnected,
  markSessionIntentionalLeave,
} from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  EventPublisher,
  ParticipantRepository,
  ParticipantSessionRepository,
} from "../ports.js";

export interface LeaveRoomCommand {
  readonly participantId: string;
  readonly participantSessionId: string;
}

export class LeaveRoom {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly participantSessions: ParticipantSessionRepository,
    private readonly clock: ApplicationClock,
    private readonly events: EventPublisher,
  ) {}

  async execute(command: LeaveRoomCommand): Promise<void> {
    const participant = await this.participants.findById(command.participantId);
    if (!participant) {
      throw new ApplicationError("NOT_FOUND", "Participant was not found.");
    }

    const participantSession = await this.participantSessions.findById(
      command.participantSessionId,
    );
    if (!participantSession) {
      throw new ApplicationError(
        "NOT_FOUND",
        "Participant session was not found.",
      );
    }

    if (participantSession.participantId !== participant.id) {
      throw new ApplicationError(
        "FORBIDDEN",
        "Participant session does not belong to the participant.",
      );
    }

    const now = this.clock.now();
    const left = markLeft(participant, now);
    const disconnected = markSessionDisconnected(
      participantSession,
      now,
      null,
    );
    const closed = markSessionIntentionalLeave(disconnected);

    await this.participants.save(left);
    await this.participantSessions.save(closed);

    await this.events.publish({
      type: "participant.left",
      occurredAt: now,
      roomId: participant.roomId,
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      participantSessionId: participantSession.id,
      userId: participant.userId,
      payload: {
        participantId: participant.id,
        participantSessionId: participantSession.id,
      },
    });
  }
}
