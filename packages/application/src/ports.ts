import type {
  AudioRole,
  InvitationState,
  ManagementRole,
  ParticipantSessionState,
  ParticipantState,
  RoomSessionState,
  RoomState,
  SpeakerRequestState,
} from '@repo/domain';

export interface UserRecord {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
}
export interface CredentialUserRecord extends UserRecord {
  readonly email: string;
  readonly passwordHash: string;
}
export interface CredentialUserRepository extends UserRepository {
  findByEmail(email: string): Promise<CredentialUserRecord | null>;
  create(user: CredentialUserRecord): Promise<void>;
}
export interface UserRepository {
  findById(userId: string): Promise<UserRecord | null>;
}
export interface RoomRepository {
  findById(roomId: string): Promise<RoomState | null>;
  findActivePublic(): Promise<readonly RoomState[]>;
  save(room: RoomState): Promise<void>;
}
export interface RoomSessionRepository {
  findActiveByRoomId(roomId: string): Promise<RoomSessionState | null>;
  findActive(): Promise<readonly RoomSessionState[]>;
  save(session: RoomSessionState): Promise<void>;
}
export interface ParticipantRepository {
  findById(participantId: string): Promise<ParticipantState | null>;
  findByRoomSession(roomSessionId: string): Promise<readonly ParticipantState[]>;
  findByUserAndRoomSession(userId: string, roomSessionId: string): Promise<ParticipantState | null>;
  save(participant: ParticipantState): Promise<void>;
}
export interface ParticipantSessionRepository {
  findById(sessionId: string): Promise<ParticipantSessionState | null>;
  findActiveByParticipantId(participantId: string): Promise<ParticipantSessionState | null>;
  findByParticipantId(participantId: string): Promise<readonly ParticipantSessionState[]>;
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

export interface TransactionScope {
  readonly users: UserRepository;
  readonly rooms: RoomRepository;
  readonly roomSessions: RoomSessionRepository;
  readonly participants: ParticipantRepository;
  readonly participantSessions: ParticipantSessionRepository;
  readonly speakerRequests: SpeakerRequestRepository;
  readonly invitations: InvitationRepository;
}

export interface Transaction {
  run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T>;
}

export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
  readonly roomId?: string;
  readonly roomSessionId?: string;
  readonly participantId?: string;
  readonly participantSessionId?: string;
  readonly userId?: string;
  readonly payload?: unknown;
}
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export interface ParticipantSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly managementRole: ManagementRole;
  readonly audioRole: AudioRole;
  readonly status: ParticipantState['status'];
}
export interface RoomSnapshot {
  readonly room: RoomState;
  readonly session: RoomSessionState;
  readonly participants: readonly ParticipantSnapshot[];
}
