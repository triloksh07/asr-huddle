import { Server, WebSocket } from 'ws';
import { 
  JsonRpcRequest, 
  JsonRpcSuccessResponse, 
  JsonRpcErrorResponse, 
  JSON_RPC_ERRORS,
  JoinRoomSchema,
  CreateTransportSchema,
  ProduceSchema,
  ConsumeSchema
} from '@repo/protocol';
import { REDIS_KEYS } from '@repo/redis-models';
import Redis from 'ioredis';
import { AuthenticatedWebSocket } from './types.js';
import { SfuClient } from './sfuClient.js';
import { CONFIG } from './config.js';

export class WsGateway {
  private wss: Server;
  private redis: Redis;
  private sfuClient: SfuClient;

  constructor(wss: Server, redisUrl: string, sfuClient: SfuClient) {
    this.wss = wss;
    this.redis = new Redis(redisUrl);
    this.sfuClient = sfuClient;
  }

  init(): void {
    this.wss.on('connection', (ws: AuthenticatedWebSocket) => {
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const rawMessage = JSON.parse(data.toString());
          await this.handleJsonRpcMessage(ws, rawMessage);
        } catch (err) {
          this.sendError(ws, null, JSON_RPC_ERRORS.PARSE_ERROR);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });
    });

    // Heartbeat Interval to prune dead connections
    setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const client = ws as AuthenticatedWebSocket;
        if (client.isAlive === false) return client.terminate();
        client.isAlive = false;
        client.ping();
      });
    }, 15000);
  }

  private async handleJsonRpcMessage(ws: AuthenticatedWebSocket, req: JsonRpcRequest): Promise<void> {
    if (req.jsonrpc !== '2.0' || !req.method || !req.id) {
      return this.sendError(ws, req.id || null, JSON_RPC_ERRORS.INVALID_REQUEST);
    }

    try {
      switch (req.method) {
        case 'ping':
          return this.sendSuccess(ws, req.id, 'pong');

        case 'join_room': {
          const parseResult = JoinRoomSchema.safeParse(req.params);
          if (!parseResult.success) {
            return this.sendError(ws, req.id, JSON_RPC_ERRORS.INVALID_PARAMS);
          }

          const { roomId } = parseResult.data;
          const mockUserId = `user-${Math.floor(Math.random() * 1000)}`;
          const mockSessionId = `sess-${Math.floor(Math.random() * 10000)}`;

          ws.userId = mockUserId;
          ws.roomId = roomId;
          ws.sessionId = mockSessionId;
          ws.role = 'listener';

          // Track in Redis
          await this.redis.sadd(REDIS_KEYS.roomParticipants(roomId), mockUserId);

          // Get Router RTP Capabilities from SFU
          const sfuRes = await this.sfuClient.sendCommand(CONFIG.targetSfuId, {
            type: 'CREATE_ROUTER',
            payload: { roomId }
          });

          return this.sendSuccess(ws, req.id, {
            sessionId: mockSessionId,
            userId: mockUserId,
            role: ws.role,
            sfuData: sfuRes
          });
        }

        case 'create_transport': {
          const parseResult = CreateTransportSchema.safeParse(req.params);
          if (!parseResult.success) {
            return this.sendError(ws, req.id, JSON_RPC_ERRORS.INVALID_PARAMS);
          }

          if (!ws.roomId || !ws.userId) {
            return this.sendError(ws, req.id, JSON_RPC_ERRORS.UNAUTHORIZED);
          }

          const transportRes = await this.sfuClient.sendCommand(CONFIG.targetSfuId, {
            type: 'CREATE_WEBRTC_TRANSPORT',
            payload: {
              roomId: ws.roomId,
              userId: ws.userId,
              direction: parseResult.data.direction
            }
          });

          return this.sendSuccess(ws, req.id, transportRes);
        }

        case 'produce': {
          const parseResult = ProduceSchema.safeParse(req.params);
          if (!parseResult.success) {
            return this.sendError(ws, req.id, JSON_RPC_ERRORS.INVALID_PARAMS);
          }

          if (!ws.roomId || !ws.userId) {
            return this.sendError(ws, req.id, JSON_RPC_ERRORS.UNAUTHORIZED);
          }

          const produceRes = await this.sfuClient.sendCommand(CONFIG.targetSfuId, {
            type: 'PRODUCE',
            payload: {
              roomId: ws.roomId,
              transportId: parseResult.data.transportId,
              kind: parseResult.data.kind,
              rtpParameters: parseResult.data.rtpParameters,
              userId: ws.userId
            }
          });

          return this.sendSuccess(ws, req.id, produceRes);
        }

        case 'consume': {
          const parseResult = ConsumeSchema.safeParse(req.params);
          if (!parseResult.success) {
            return this.sendError(ws, req.id, JSON_RPC_ERRORS.INVALID_PARAMS);
          }

          if (!ws.roomId || !ws.userId) {
            return this.sendError(ws, req.id, JSON_RPC_ERRORS.UNAUTHORIZED);
          }

          const consumeRes = await this.sfuClient.sendCommand(CONFIG.targetSfuId, {
            type: 'CONSUME',
            payload: {
              roomId: ws.roomId,
              transportId: parseResult.data.transportId,
              producerId: parseResult.data.producerId,
              rtpCapabilities: parseResult.data.rtpCapabilities,
              userId: ws.userId
            }
          });

          return this.sendSuccess(ws, req.id, consumeRes);
        }

        default:
          return this.sendError(ws, req.id, JSON_RPC_ERRORS.METHOD_NOT_FOUND);
      }
    } catch (err: unknown) {
      console.error('[WS Gateway Error]:', err);
      return this.sendError(ws, req.id, JSON_RPC_ERRORS.INTERNAL_ERROR);
    }
  }

  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    if (ws.roomId && ws.userId) {
      this.redis.srem(REDIS_KEYS.roomParticipants(ws.roomId), ws.userId);
    }
  }

  private sendSuccess(ws: WebSocket, id: string | number, result: unknown): void {
    const response: JsonRpcSuccessResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    ws.send(JSON.stringify(response));
  }

  private sendError(ws: WebSocket, id: string | number | null, errorObj: { code: number; message: string }): void {
    const response: JsonRpcErrorResponse = {
      jsonrpc: '2.0',
      id,
      error: errorObj,
    };
    ws.send(JSON.stringify(response));
  }
}