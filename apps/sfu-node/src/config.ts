// import { ObjectEncodingOptions } from 'node:fs';
// import os from 'node:os';
// import { RtpCodecCapability } from 'mediasoup/node/lib/RtpParameters.js';

// export const CONFIG = {
//   sfuId: process.env.SFU_ID || `sfu-${os.hostname()}-${process.pid}`,
//   listenIp: process.env.SFU_LISTEN_IP || '0.0.0.0',
//   announcedIp: process.env.SFU_ANNOUNCED_IP || '127.0.0.1',
//   rtcMinPort: Number(process.env.SFU_RTC_MIN_PORT) || 40000,
//   rtcMaxPort: Number(process.env.SFU_RTC_MAX_PORT) || 49999,
//   mediaCodecs: [
//     {
//       kind: 'audio',
//       mimeType: 'audio/opus',
//       clockRate: 48000,
//       channels: 1,
//       parameters: {
//         minptime: 10,
//         ptime: 10,
//         maxaveragebitrate: 32000,
//         useinbandfec: 1,
//         usedtx: 1,
//       },
//     },
//   ] as RtpCodecCapability[],
// };

import dotenv from 'dotenv';
import path from 'node:path';

// Load root .env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const CONFIG = {
  sfuId: process.env.SFU_ID || 'sfu-node-1',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  listenIp: process.env.SFU_LISTEN_IP || '0.0.0.0',
  announcedIp: process.env.SFU_ANNOUNCED_IP || '127.0.0.1',
  rtcMinPort: Number(process.env.SFU_RTC_MIN_PORT || 40000),
  rtcMaxPort: Number(process.env.SFU_RTC_MAX_PORT || 49999),
};
