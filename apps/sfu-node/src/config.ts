import 'dotenv/config';
import { types } from 'mediasoup';
import { OPUS_MEDIA_CODEC_CONFIG } from '@repo/audio-config';

function integer(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Invalid SFU integer configuration.');
  }
  return parsed;
}

const rtcMinPort = integer(process.env.SFU_RTC_MIN_PORT, 40000);
const rtcMaxPort = integer(process.env.SFU_RTC_MAX_PORT, 49999);

if (rtcMinPort > rtcMaxPort) {
  throw new Error('SFU_RTC_MIN_PORT must not exceed SFU_RTC_MAX_PORT.');
}

export const CONFIG = {
  sfuId: process.env.SFU_ID ?? 'sfu-node-1',
  listenHost: process.env.SFU_LISTEN_HOST ?? '0.0.0.0',
  port: integer(process.env.SFU_PORT, 4000),
  announcedAddress: process.env.SFU_ANNOUNCED_ADDRESS,
  rtcMinPort,
  rtcMaxPort,
  mediaCodecs: [OPUS_MEDIA_CODEC_CONFIG] as unknown as types.RtpCodecCapability[],
};
