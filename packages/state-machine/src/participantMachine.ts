export type ParticipantRole = 'host' | 'cohost' | 'speaker' | 'listener';
export type ConnectionState =
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'left'
  | 'removed';

export interface ParticipantContext {
  userId: string;
  roomId: string;
  role: ParticipantRole;
  connectionState: ConnectionState;
  micSelfEnabled: boolean;
  micModeratorMuted: boolean;
}

export function calculateEffectiveMicState(ctx: ParticipantContext): boolean {
  const canPublishRole = ctx.role === 'host' || ctx.role === 'cohost' || ctx.role === 'speaker';
  return canPublishRole && ctx.micSelfEnabled && !ctx.micModeratorMuted;
}

export function transitionConnectionState(
  currentState: ConnectionState,
  event: 'WS_OPEN' | 'WS_DROP' | 'RECONNECT_SUCCESS' | 'GRACE_EXPIRED' | 'LEAVE'
): ConnectionState {
  switch (currentState) {
    case 'joining':
      return event === 'WS_OPEN' ? 'connected' : 'disconnected';
    case 'connected':
      if (event === 'WS_DROP') return 'reconnecting';
      if (event === 'LEAVE') return 'left';
      return currentState;
    case 'reconnecting':
      if (event === 'RECONNECT_SUCCESS') return 'connected';
      if (event === 'GRACE_EXPIRED') return 'disconnected';
      if (event === 'LEAVE') return 'left';
      return currentState;
    default:
      return currentState;
  }
}
