import { z } from 'zod';

export type JsonRpcId = string | number;

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params: TParams;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcErrorObject<TData = unknown> {
  code: number;
  message: string;
  data?: TData;
}

export interface JsonRpcErrorResponse<TData = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: JsonRpcErrorObject<TData>;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: '2.0';
  method: string;
  params: TParams;
}

// Zod Schemas for Runtime Ingestion Validation
// export const JoinRoomSchema = z.object({
//   roomId: z.string().uuid(),
//   sessionId: z.string().optional(),
// });
export const JoinRoomSchema = z.object({
  roomId: z.string().min(1, 'roomId cannot be empty'),
  userId: z.string().optional(),
  displayName: z.string().optional(),
});

export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export const CreateTransportSchema = z.object({
  direction: z.enum(['send', 'recv']),
});

export const ConnectTransportSchema = z.object({
  transportId: z.string(),
  dtlsParameters: z.record(z.unknown()),
});

export const ProduceSchema = z.object({
  transportId: z.string(),
  kind: z.literal('audio'),
  rtpParameters: z.record(z.unknown()),
});

export const ConsumeSchema = z.object({
  transportId: z.string(),
  producerId: z.string(),
  rtpCapabilities: z.record(z.unknown()),
});

export const SendReactionSchema = z.object({
  type: z.enum(['clap', 'laugh', 'heart', 'fire']),
});
