import { SfuCommand } from './commands.js';

export interface SfuRequestMessage {
  requestId: string;
  sfuId: string;
  command: SfuCommand;
}

export interface SfuResponseMessage {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
