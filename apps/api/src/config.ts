// export const CONFIG = {
//   port: Number(process.env.PORT) || 3000,
//   redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
//   jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key',
//   targetSfuId: process.env.TARGET_SFU_ID || 'sfu-1',
// };
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const CONFIG = {
  port: Number(process.env.PORT || 3000),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  targetSfuId: process.env.TARGET_SFU_ID || 'sfu-node-1',
};
