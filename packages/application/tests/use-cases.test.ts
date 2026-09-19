import { describe, expect, it } from 'vitest';
import { JoinRoom, RequestSpeaker } from '../src/index.js';
import { type ConnectionId } from '@repo/domain';
import { applicationFixture, base } from './support/memory-application.js';

describe('application use cases', () => {
  it('joins a non-host user as a listener', async () => {
    const f = applicationFixture();
    const joined = await new JoinRoom(
      f.transaction,
      f.ids,
      { now: () => base },
      f.eventPublisher
    ).execute({ roomId: f.room.id, userId: 'user-1', connectionId: 'conn-1' as ConnectionId });
    expect(joined.audioRole).toBe('LISTENER');
    expect(joined.managementRole).toBe('NONE');
    expect(joined.roomSessionId).toBe(f.session.id);
  });
  it('creates one pending speaker request and rejects duplicates', async () => {
    const f = applicationFixture();
    const joined = await new JoinRoom(
      f.transaction,
      f.ids,
      { now: () => base },
      f.eventPublisher
    ).execute({ roomId: f.room.id, userId: 'user-1', connectionId: 'conn-1' as ConnectionId });
    const useCase = new RequestSpeaker(
      f.participants,
      f.roomSessions,
      f.speakerRequests,
      f.ids,
      { now: () => base },
      f.eventPublisher
    );
    const request = await useCase.execute({ participantId: joined.participantId });
    expect(request.status).toBe('PENDING');
    expect(request.participantId).toBe(joined.participantId);
    await expect(useCase.execute({ participantId: joined.participantId })).rejects.toThrow(
      'already pending'
    );
  });
});
