import {
  createSpeakerRequest,
  assertRoomSessionActive,
} from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  IdGenerator,
  ParticipantRepository,
  RoomSessionRepository,
  SpeakerRequestRepository,
} from "../ports.js";

export interface RequestSpeakerCommand {
  readonly participantId: string;
}

export class RequestSpeaker {
  constructor(
    private readonly participants: ParticipantRepository,
    private readonly sessions: RoomSessionRepository,
    private readonly requests: SpeakerRequestRepository,
    private readonly ids: IdGenerator,
    private readonly clock: ApplicationClock,
  ) {}

  async execute(command: RequestSpeakerCommand) {
    const participant = await this.participants.findById(command.participantId);
    if (!participant) {
      throw new ApplicationError("NOT_FOUND", "Participant was not found.");
    }

    if (participant.status !== "CONNECTED") {
      throw new ApplicationError("INVALID_STATE", "Only connected participants can request to speak.");
    }

    if (participant.audioRole === "SPEAKER") {
      throw new ApplicationError("CONFLICT", "Participant is already a speaker.");
    }

    const session = await this.sessions.findActiveByRoomId(participant.roomId);
    if (!session) {
      throw new ApplicationError("ROOM_ENDED", "The room is not active.");
    }

    assertRoomSessionActive(session);

    const existing = await this.requests.findPendingByParticipantId(participant.id);
    if (existing) {
      throw new ApplicationError("CONFLICT", "A speaker request is already pending.");
    }

    const request = createSpeakerRequest({
      id: this.ids.next() as ReturnType<typeof createSpeakerRequest>["id"],
      roomSessionId: participant.roomSessionId,
      participantId: participant.id,
      createdAt: this.clock.now(),
    });

    await this.requests.save(request);
    return request;
  }
}
