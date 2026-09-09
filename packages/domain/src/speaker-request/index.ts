import {
  DomainError,
  type ParticipantId,
  type RoomSessionId,
  type SpeakerRequestId,
} from "../shared.js";

export type SpeakerRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "CANCELLED";

export type SpeakerRequestState = Readonly<{
  id: SpeakerRequestId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  status: SpeakerRequestStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}>;

export function createSpeakerRequest(input: {
  id: SpeakerRequestId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  createdAt: Date;
}): SpeakerRequestState {
  return {
    id: input.id,
    roomSessionId: input.roomSessionId,
    participantId: input.participantId,
    status: "PENDING",
    createdAt: input.createdAt,
    resolvedAt: null,
  };
}

export function approveSpeakerRequest(
  request: SpeakerRequestState,
  resolvedAt: Date,
): SpeakerRequestState {
  return resolve(request, "APPROVED", resolvedAt);
}

export function denySpeakerRequest(
  request: SpeakerRequestState,
  resolvedAt: Date,
): SpeakerRequestState {
  return resolve(request, "DENIED", resolvedAt);
}

export function cancelSpeakerRequest(
  request: SpeakerRequestState,
  resolvedAt: Date,
): SpeakerRequestState {
  return resolve(request, "CANCELLED", resolvedAt);
}

function resolve(
  request: SpeakerRequestState,
  status: Exclude<SpeakerRequestStatus, "PENDING">,
  resolvedAt: Date,
): SpeakerRequestState {
  if (request.status !== "PENDING") {
    throw new DomainError(
      "SPEAKER_REQUEST_ALREADY_RESOLVED",
      "This speaker request has already been resolved.",
    );
  }

  return {
    ...request,
    status,
    resolvedAt,
  };
}
