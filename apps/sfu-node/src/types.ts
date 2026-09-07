import { Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types.js';

export interface RoomMediaState {
  roomId: string;
  router: Router;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  userTransports: Map<string, Set<string>>; // userId -> Set<transportId>
}