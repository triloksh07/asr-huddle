import { describe, expect, it } from 'vitest';
import {
  connectTransportSchema,
  produceAudioSchema,
  mediaRpcParamsSchemas,
} from '../src/validation.js';

describe('media contract validation', () => {
  it('accepts a transport connection payload', () => {
    expect(
      connectTransportSchema.parse({
        transportId: 't1',
        participantId: 'p1',
        participantSessionId: 'ps1',
        connectionId: 'c1',
        dtlsParameters: {},
      }).transportId
    ).toBe('t1');
  });

  it('requires audio producers to identify their participant session and connection', () => {
    expect(() =>
      produceAudioSchema.parse({
        transportId: 't1',
        kind: 'audio',
        rtpParameters: {},
        appData: { participantId: 'p1', participantSessionId: 'ps1' },
      })
    ).toThrow();
  });

  it('defines runtime params validation for every media RPC method', () => {
    expect(Object.keys(mediaRpcParamsSchemas)).toHaveLength(9);
  });
});
