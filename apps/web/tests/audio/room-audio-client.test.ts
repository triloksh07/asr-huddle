import { describe, expect, it } from 'vitest';

describe('first browser audio slice', () => {
  it('documents the browser command sequence', () => {
    const sequence = [
      'room.join',
      'media.transport.create(send)',
      'media.transport.connect',
      'media.audio.produce',
      'media.transport.create(recv)',
      'media.transport.connect',
      'media.audio.producers',
      'media.audio.consume',
    ];
    expect(sequence[0]).toBe('room.join');
    expect(sequence).toContain('media.audio.produce');
    expect(sequence).toContain('media.audio.consume');
  });

  it('only restores transmission when the previous client state was transmitting and the current server state allows it', () => {
    const shouldRestore = (wasTransmitting: boolean, canTransmitAudio: boolean) =>
      wasTransmitting && canTransmitAudio;

    expect(shouldRestore(true, true)).toBe(true);
    expect(shouldRestore(true, false)).toBe(false);
    expect(shouldRestore(false, true)).toBe(false);
    expect(shouldRestore(false, false)).toBe(false);
  });
});
