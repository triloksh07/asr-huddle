import type {
  AudioRole,
  InvitationState,
  ManagementRole,
  ParticipantSessionState,
  ParticipantState,
  RoomSessionState,
  RoomState,
  SpeakerRequestState,
} from "@repo/domain";

export interface UserRecord {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
}

export interface UserRepository {
  findById(userId: string): Promise<UserRecord | null>;
}

export interface RoomRepository {
  findById(roomId: string): Promise<RoomState | null>;
  save(room: RoomState): Promise<void>;
}

export interface RoomSessionRepository {
  findActiveByRoomId(roomId: string): Promise<RoomSessionState | null>;
  save(session: RoomSessionState): Promise<void>;
}

export interface ParticipantRepository {
  findById(participantId: string): Promise<ParticipantState | null>;
  findByRoomSession(roomSessionId: string): Promise<readonly ParticipantState[]>;
  save(participant: ParticipantState): Promise<void>;
}

export interface ParticipantSessionRepository {
  findById(sessionId: string): Promise<ParticipantSessionState | null>;
  findActiveByParticipantId(participantId: string): Promise<ParticipantSessionState | null>;
  save(session: ParticipantSessionState): Promise<void>;
}

export interface SpeakerRequestRepository {
  findById(requestId: string): Promise<SpeakerRequestState | null>;
  findPendingByParticipantId(participantId: string): Promise<SpeakerRequestState | null>;
  save(request: SpeakerRequestState): Promise<void>;
}

export interface InvitationRepository {
  findById(invitationId: string): Promise<InvitationState | null>;
  findPendingByParticipantId(participantId: string): Promise<InvitationState | null>;
  save(invitation: InvitationState): Promise<void>;
}

export interface IdGenerator {
  next(): string;
}

export interface ApplicationClock {
  now(): Date;
}

export interface Transaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
  readonly roomId?: string;
  readonly roomSessionId?: string;
  readonly participantId?: string;
}

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export interface ParticipantSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly managementRole: ManagementRole;
  readonly audioRole: AudioRole;
  readonly status: ParticipantState["status"];
}

export interface RoomSnapshot {
  readonly room: RoomState;
  readonly session: RoomSessionState;
  readonly participants: readonly ParticipantSnapshot[];
}
