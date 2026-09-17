import { describe, expect, it } from 'vitest';
import { UnconfiguredMediaService } from '../../src/media/media-service.js';

const join = {
  roomId: 'room-1' as never,
  roomSessionId: 'room-session-1' as never,
  participantId: 'participant-1' as never,
  participantSessionId: 'participant-session-1' as never,
};

describe('UnconfiguredMediaService', () => {
  it('fails media operations explicitly', async () => {
    const service = new UnconfiguredMediaService();
    await expect(service.createWebRtcTransport(join)).rejects.toThrow(
      'Media service is not configured.'
    );
    await expect(service.listAudioProducers(join)).rejects.toThrow(
      'Media service is not configured.'
    );
    await expect(service.revokeAudioProduction(join)).rejects.toThrow(
      'Media service is not configured.'
    );
    await expect(service.closeParticipantMedia(join)).rejects.toThrow(
      'Media service is not configured.'
    );
  });

  it('fails producer and consumer operations explicitly', async () => {
    const service = new UnconfiguredMediaService();
    await expect(
      service.produceAudio({
        transportId: 't1' as never,
        kind: 'audio',
        rtpParameters: {},
        appData: { participantId: 'p1', participantSessionId: 'ps1', connectionId: 'c1' },
      })
    ).rejects.toThrow('Media service is not configured.');
    await expect(
      service.consumeAudio({
        roomId: 'r1' as never,
        participantId: 'p1' as never,
        participantSessionId: 'ps1' as never,
        connectionId: 'c1' as never,
        producerId: 'pr1' as never,
        rtpCapabilities: { codecs: [] },
      })
    ).rejects.toThrow('Media service is not configured.');
  });
});
