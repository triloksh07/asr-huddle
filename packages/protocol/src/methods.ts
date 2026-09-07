// packages/protocol/src/methods.ts

// --- METHODS (Client -> Server) ---
export interface ClientMethods {
  'room.join': {
    params: { roomId: string; token: string };
    result: {
      roomId: string;
      peers: Array<{ userId: string; role: string }>;
      routerRtpCapabilities: unknown;
    };
  };
  'webrtc.createTransport': {
    params: { roomId: string; direction: 'send' | 'recv' };
    result: {
      transportId: string;
      iceParameters: unknown;
      iceCandidates: unknown[];
      dtlsParameters: unknown;
    };
  };
  'webrtc.connectTransport': {
    params: { transportId: string; dtlsParameters: unknown };
    result: { connected: boolean };
  };
  'webrtc.produce': {
    params: {
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
      appData?: Record<string, unknown>;
    };
    result: { producerId: string };
  };
  'webrtc.consume': {
    params: { transportId: string; producerId: string; rtpCapabilities: unknown };
    result: {
      consumerId: string;
      producerId: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
    };
  };
}

// --- NOTIFICATIONS (Server -> Client) ---
export interface ServerNotifications {
  'peer.joined': { userId: string; role: string };
  'peer.left': { userId: string; reason: string };
  'producer.new': {
    peerId: string;
    producerId: string;
    kind: 'audio' | 'video';
    appData?: Record<string, unknown>;
  };
  'producer.closed': { peerId: string; producerId: string };
  'active.speaker': { peerId: string; volume: number };
}
