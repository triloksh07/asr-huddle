export const REDIS_KEYS = {
  // Session & User Mappings
  session: (sessionId: string) => `session:${sessionId}` as const,
  userActiveSession: (userId: string) => `user:${userId}:active_session` as const,

  // Room State & Metadata
  roomMeta: (roomId: string) => `room:${roomId}:meta` as const,
  roomParticipants: (roomId: string) => `room:${roomId}:participants` as const,
  roomProducers: (roomId: string) => `room:${roomId}:producers` as const,
  roomCohosts: (roomId: string) => `room:${roomId}:cohosts` as const,
  roomSpeakers: (roomId: string) => `room:${roomId}:speakers` as const,
  roomRequests: (roomId: string) => `room:${roomId}:requests` as const,
  roomRequestDetail: (roomId: string, requestId: string) =>
    `room:${roomId}:request:${requestId}` as const,

  // Locks & Timers
  lockPromote: (roomId: string) => `lock:room:${roomId}:promote` as const,
  sessionGraceTimer: (sessionId: string) => `session:${sessionId}:grace_timer` as const,

  // Pub/Sub Channels
  roomEventsChannel: (roomId: string) => `room:${roomId}:events` as const,
  sfuCommandChannel: (sfuId: string) => `sfu:${sfuId}:cmd` as const,
};

export const REDIS_TTLS = {
  SESSION_30_DAYS: 2592000, // 30 days
  USER_ACTIVE_SESSION_24H: 86400, // 24 hours
  GRACE_TIMER_30S: 30, // 30 seconds
  LOCK_5S: 5, // 5 seconds distributed lock
} as const;
