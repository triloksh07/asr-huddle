export interface TransportOptions {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
}

export type SfuCommand =
  | { type: "CREATE_ROUTER"; payload: { roomId: string } }
  | { type: "CLOSE_ROUTER"; payload: { roomId: string } }
  | {
      type: "CREATE_WEBRTC_TRANSPORT";
      payload: { roomId: string; userId: string; direction: "send" | "recv" };
    }
  | {
      type: "CONNECT_WEBRTC_TRANSPORT";
      payload: { roomId: string; transportId: string; dtlsParameters: unknown };
    }
  | {
      type: "PRODUCE";
      payload: {
        roomId: string;
        transportId: string;
        kind: "audio";
        rtpParameters: unknown;
        userId: string;
      };
    }
  | {
      type: "CONSUME";
      payload: {
        roomId: string;
        transportId: string;
        producerId: string;
        rtpCapabilities: unknown;
        userId: string;
      };
    }
  | { type: "CLOSE_PRODUCER"; payload: { roomId: string; producerId: string } }
  | { type: "CLOSE_CONSUMER"; payload: { roomId: string; consumerId: string } };

export type SfuEvent =
  | {
      type: "ROUTER_CREATED";
      payload: { roomId: string; routerRtpCapabilities: unknown };
    }
  | {
      type: "TRANSPORT_CREATED";
      payload: { roomId: string; userId: string; transport: TransportOptions };
    }
  | {
      type: "PRODUCER_CREATED";
      payload: { roomId: string; producerId: string; userId: string };
    }
  | {
      type: "CONSUMER_CREATED";
      payload: {
        roomId: string;
        consumerId: string;
        producerId: string;
        rtpParameters: unknown;
      };
    }
  | {
      type: "VAD_VOLUMES";
      payload: {
        roomId: string;
        volumes: Array<{ producerId: string; volume: number }>;
      };
    }
  | {
      type: "SFU_METRICS";
      payload: { sfuId: string; cpuUsage: number; activeTransports: number };
    };
