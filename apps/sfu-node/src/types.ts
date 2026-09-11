import { types } from 'mediasoup';

export interface RoomMediaState {
  roomId: string;
  router: types.Router;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
  userTransports: Map<string, Set<string>>; // userId -> Set<transportId>
}
