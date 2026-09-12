import type { Transaction, TransactionScope } from '@repo/application';
import { PostgresInvitationRepository } from './repositories/invitation-repository.js';
import { PostgresParticipantRepository } from './repositories/participant-repository.js';
import { PostgresParticipantSessionRepository } from './repositories/participant-session-repository.js';
import { PostgresRoomRepository } from './repositories/room-repository.js';
import { PostgresRoomSessionRepository } from './repositories/room-session-repository.js';
import { PostgresSpeakerRequestRepository } from './repositories/speaker-request-repository.js';
import { PostgresUserRepository } from './repositories/user-repository.js';
import type { Database } from './client.js';

export class PostgresTransaction implements Transaction {
  constructor(private readonly database: Database['db']) {}

  async run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.database.transaction(async tx => {
      // Drizzle's transaction executor has the same query/insert/update/delete
      // surface required by our repository adapters. Keep the cast here so the
      // transaction-specific type never leaks through the application ports.
      const executor = tx as unknown as Database['db'];

      const scope: TransactionScope = {
        users: new PostgresUserRepository(executor),
        rooms: new PostgresRoomRepository(executor),
        roomSessions: new PostgresRoomSessionRepository(executor),
        participants: new PostgresParticipantRepository(executor),
        participantSessions: new PostgresParticipantSessionRepository(executor),
        speakerRequests: new PostgresSpeakerRequestRepository(executor),
        invitations: new PostgresInvitationRepository(executor),
      };

      return work(scope);
    });
  }
}
