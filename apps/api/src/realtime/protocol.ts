export const realtimeInteractionProtocol = {
  speakerHand: 'speaker.hand',
  roomReaction: 'room.reaction',
} as const;
export const realtimeProtocol = {
  roomJoin: 'room.join',
  roomLeave: 'room.leave',
  roomEnd: 'room.end',
  roomReconnect: 'room.reconnect',
} as const;
export const realtimeMediaProtocol = {
  transportCreate: 'media.transport.create',
  transportConnect: 'media.transport.connect',
  audioProduce: 'media.audio.produce',
  audioProducers: 'media.audio.producers',
  audioConsume: 'media.audio.consume',
  audioState: 'media.audio.state',
} as const;
export interface MediaTransportCreateResult {
  transportId: string;
  direction: 'send' | 'recv';
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
  rtpCapabilities: unknown;
}
export interface AudioProduceResult {
  producerId: string;
}
export interface AudioConsumerResult {
  consumerId: string;
  producerId: string;
  kind: 'audio';
  rtpParameters: unknown;
}
