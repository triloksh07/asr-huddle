import { markLeft } from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  ParticipantRepository,
} from "../ports.js";

export interface LeaveRoomCommand {
  readonly participantId: string;
}

export class LeaveRoom {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly clock: ApplicationClock,
  ) {}

  async execute(command: LeaveRoomCommand): Promise<void> {
    const participant = await this.participants.findById(command.participantId);
    if (!participant) {
      throw new ApplicationError("NOT_FOUND", "Participant was not found.");
    }

    const left = markLeft(participant, this.clock.now());
    await this.participants.save(left);
  }
}
