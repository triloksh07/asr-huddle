import type { MediaService } from '@repo/media-contract';
import { RpcMediaService } from '../media/rpc-media-service.js';

export interface ApiMediaConfig {
  sfuBaseUrl: string;
  authSecret: string;
  timeoutMs?: number;
}

export function createApiMediaService(config: ApiMediaConfig): MediaService {
  return new RpcMediaService({
    baseUrl: config.sfuBaseUrl,
    authSecret: config.authSecret,
    requestTimeoutMs: config.timeoutMs,
  });
}
