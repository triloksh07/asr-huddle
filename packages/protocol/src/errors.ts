export const JSON_RPC_ERRORS = {
  // Standard JSON-RPC 2.0 Errors
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },

  // Domain & Auth Errors
  UNAUTHORIZED: { code: -32000, message: 'Unauthorized' },
  FORBIDDEN: { code: -32001, message: 'Forbidden' },
  ROOM_NOT_FOUND: { code: -32002, message: 'Room not found' },
  ROOM_FULL: { code: -32003, message: 'Room capacity reached' },
  SESSION_CONFLICT: { code: -32004, message: 'User already active in another room' },
  INVALID_SESSION: { code: -32005, message: 'Reconnection session expired or invalid' },

  // Media & WebRTC Errors
  TRANSPORT_NOT_FOUND: { code: -32006, message: 'Transport not found' },
  PRODUCER_NOT_FOUND: { code: -32007, message: 'Producer not found' },
  REQUEST_NOT_FOUND: { code: -32008, message: 'Speaker request not found' },
  SPEAKER_CAPACITY_FULL: { code: -32009, message: 'Speaker capacity limit reached' },
  RATE_LIMITED: { code: -32010, message: 'Too many requests' },
  CANNOT_MUTE_HOST: { code: -32011, message: 'Host cannot be muted' },
  CANNOT_REMOVE_HOST: { code: -32012, message: 'Host cannot be removed' },
} as const;
