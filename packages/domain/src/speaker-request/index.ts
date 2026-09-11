import {
  DomainError,
  type ParticipantId,
  type RoomSessionId,
  type SpeakerRequestId,
} from '../shared.js';
export type SpeakerRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';
export type SpeakerRequestState = Readonly<{
  id: SpeakerRequestId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  status: SpeakerRequestStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByParticipantId: ParticipantId | null;
}>;
export function createSpeakerRequest(input: {
  id: SpeakerRequestId;
  roomSessionId: RoomSessionId;
  participantId: ParticipantId;
  createdAt: Date;
}): SpeakerRequestState {
  return {
    ...input,
    status: 'PENDING',
    resolvedAt: null,
    resolvedByParticipantId: null,
  };
}
export function approveSpeakerRequest(
  r: SpeakerRequestState,
  at: Date,
  by: ParticipantId
): SpeakerRequestState {
  return resolve(r, 'APPROVED', at, by);
}
export function denySpeakerRequest(
  r: SpeakerRequestState,
  at: Date,
  by: ParticipantId
): SpeakerRequestState {
  return resolve(r, 'DENIED', at, by);
}
export function cancelSpeakerRequest(
  r: SpeakerRequestState,
  at: Date,
  by?: ParticipantId
): SpeakerRequestState {
  return resolve(r, 'CANCELLED', at, by ?? null);
}
function resolve(
  r: SpeakerRequestState,
  status: Exclude<SpeakerRequestStatus, 'PENDING'>,
  at: Date,
  by: ParticipantId | null
) {
  if (r.status !== 'PENDING')
    throw new DomainError(
      'SPEAKER_REQUEST_ALREADY_RESOLVED',
      'This speaker request has already been resolved.'
    );
  return { ...r, status, resolvedAt: at, resolvedByParticipantId: by };
}
