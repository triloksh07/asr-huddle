import { cancelSpeakerRequest } from "@repo/domain";
import { ApplicationError } from "../errors.js";
import type {
  ApplicationClock,
  SpeakerRequestRepository,
} from "../ports.js";

export interface CancelSpeakerRequestCommand {
  readonly requestId: string;
  readonly participantId: string;
}

export class CancelSpeakerRequest {
  constructor(
    private readonly requests: SpeakerRequestRepository,
    private readonly clock: ApplicationClock,
  ) {}

  async execute(command: CancelSpeakerRequestCommand) {
    const request = await this.requests.findById(command.requestId);
    if (!request) {
      throw new ApplicationError("NOT_FOUND", "Speaker request was not found.");
    }

    if (request.participantId !== command.participantId) {
      throw new ApplicationError("FORBIDDEN", "Only the requesting participant can cancel this request.");
    }

    const cancelled = cancelSpeakerRequest(request, this.clock.now());
    await this.requests.save(cancelled);
    return cancelled;
  }
}
