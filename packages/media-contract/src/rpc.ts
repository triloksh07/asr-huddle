import type {
  ConsumeAudioCommand,
  CreateRoomMediaContext,
  JoinMediaContext,
  CloseParticipantMediaContext,
  ConnectTransportCommand,
  ProduceAudioCommand,
} from './types.js';

export const mediaRpcMethods = {
  createRouter: 'media.createRouter',
  createTransport: 'media.createTransport',
  connectTransport: 'media.connectTransport',
  produceAudio: 'media.produceAudio',
  consumeAudio: 'media.consumeAudio',
  listAudioProducers: 'media.listAudioProducers',
  revokeAudioProduction: 'media.revokeAudioProduction',
  closeParticipant: 'media.closeParticipant',
  closeRoom: 'media.closeRoom',
} as const;
export type MediaRpcMethod = (typeof mediaRpcMethods)[keyof typeof mediaRpcMethods];

export type MediaRpcParams =
  | CreateRoomMediaContext
  | JoinMediaContext
  | CloseParticipantMediaContext
  | ConnectTransportCommand
  | ProduceAudioCommand
  | ConsumeAudioCommand;

export interface MediaRpcRequest {
  requestId: string;
  method: MediaRpcMethod;
  params: MediaRpcParams;
}

export interface MediaRpcSuccess {
  requestId: string;
  ok: true;
  /** Always present. Void operations use null rather than undefined. */
  result: unknown;
}

export interface MediaRpcFailure {
  requestId: string;
  ok: false;
  error: { code: string; message: string };
}

export type MediaRpcResponse = MediaRpcSuccess | MediaRpcFailure;
