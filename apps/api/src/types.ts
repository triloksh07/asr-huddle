import { WebSocket } from 'ws';
import { ParticipantRole } from '@repo/state-machine';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
  roomId?: string;
  role?: ParticipantRole;
  isAlive?: boolean;
}

export interface SessionContext {
  userId: string;
  roomId: string;
  role: ParticipantRole;
  connectionState: string;
  createdAt: string;
}