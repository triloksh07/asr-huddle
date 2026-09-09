import {
  DomainError,
  type InvitationId,
  type ParticipantId,
  type RoomSessionId,
} from "../shared.js";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";

export type InvitationState = Readonly<{
  id: InvitationId;
  roomSessionId: RoomSessionId;
  targetParticipantId: ParticipantId;
  status: InvitationStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}>;

export function createInvitation(input: {
  id: InvitationId;
  roomSessionId: RoomSessionId;
  targetParticipantId: ParticipantId;
  createdAt: Date;
}): InvitationState {
  return {
    id: input.id,
    roomSessionId: input.roomSessionId,
    targetParticipantId: input.targetParticipantId,
    status: "PENDING",
    createdAt: input.createdAt,
    resolvedAt: null,
  };
}

export function acceptInvitation(
  invitation: InvitationState,
  resolvedAt: Date,
): InvitationState {
  return resolve(invitation, "ACCEPTED", resolvedAt);
}

export function declineInvitation(
  invitation: InvitationState,
  resolvedAt: Date,
): InvitationState {
  return resolve(invitation, "DECLINED", resolvedAt);
}

export function cancelInvitation(
  invitation: InvitationState,
  resolvedAt: Date,
): InvitationState {
  return resolve(invitation, "CANCELLED", resolvedAt);
}

function resolve(
  invitation: InvitationState,
  status: Exclude<InvitationStatus, "PENDING">,
  resolvedAt: Date,
): InvitationState {
  if (invitation.status !== "PENDING") {
    throw new DomainError(
      "INVITATION_ALREADY_RESOLVED",
      "This invitation has already been resolved.",
    );
  }

  return {
    ...invitation,
    status,
    resolvedAt,
  };
}
