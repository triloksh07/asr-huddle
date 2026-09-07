export const OPUS_STEREO_DISABLED = 0;
export const OPUS_MAX_BITRATE = 32000; // 32 kbps mono voice
export const OPUS_PTIME = 10; // 10ms frame size

export const OPUS_MEDIA_CODEC_CONFIG = {
  kind: 'audio',
  mimeType: 'audio/opus',
  clockRate: 48000,
  channels: 1, // Mono voice
  parameters: {
    minptime: OPUS_PTIME,
    ptime: OPUS_PTIME,
    maxaveragebitrate: OPUS_MAX_BITRATE,
    useinbandfec: 1, // Forward Error Correction
    usedtx: 1, // Discontinuous Transmission (Silence suppression)
    cbr: 0,
    'sprop-maxcapturerate': 48000,
  },
} as const;

export function applyOpusBaselineSDP(sdp: string): string {
  const opusFmtpRegex = /a=fmtp:(\d+)\s+(.*)/;
  const match = sdp.match(opusFmtpRegex);
  if (!match) return sdp;
  const pt = match[1];
  const tuned = `a=fmtp:${pt} minptime=10;ptime=10;maxaveragebitrate=32000;useinbandfec=1;usedtx=1;stereo=0;sprop-maxcapturerate=48000`;
  return sdp.replace(opusFmtpRegex, tuned);
}
