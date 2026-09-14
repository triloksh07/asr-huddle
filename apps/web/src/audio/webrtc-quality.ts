import { types } from 'mediasoup-client';

export interface WebRtcAudioQualitySample {
  readonly capturedAt: string;
  readonly transportId: string;
  readonly direction: 'send' | 'recv';
  readonly connectionState: RTCPeerConnectionState;
  readonly iceGatheringState: RTCIceGatheringState;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly packetsSent: number;
  readonly packetsReceived: number;
  readonly packetsLost: number;
  readonly jitterSeconds?: number;
  readonly roundTripTimeSeconds?: number;
}

interface MutableTransportSample {
  readonly transport: types.Transport;
  previousBytesSent: number;
  previousBytesReceived: number;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function maxNumber(current: number, next: number | undefined): number {
  return next !== undefined && next > current ? next : current;
}

export type WebRtcAudioQualityListener = (sample: WebRtcAudioQualitySample) => void;

export class WebRtcAudioQualityCollector {
  private readonly transports = new Map<string, MutableTransportSample>();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly listener: WebRtcAudioQualityListener,
    private readonly intervalMs = 1000
  ) {
    if (!Number.isInteger(intervalMs) || intervalMs < 250) {
      throw new Error('WebRTC quality interval must be an integer >= 250ms.');
    }
  }

  addTransport(transport: types.Transport): void {
    this.transports.set(transport.id, {
      transport,
      previousBytesSent: 0,
      previousBytesReceived: 0,
    });
  }

  removeTransport(transportId: string): void {
    this.transports.delete(transportId);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.sampleAll();
    }, this.intervalMs);
    void this.sampleAll();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async sampleAll(): Promise<void> {
    if (!this.running) return;

    const samples = [...this.transports.values()];
    await Promise.all(
      samples.map(async state => {
        if (state.transport.closed) {
          this.removeTransport(state.transport.id);
          return;
        }

        try {
          const stats = await state.transport.getStats();
          let bytesSent = 0;
          let bytesReceived = 0;
          let packetsSent = 0;
          let packetsReceived = 0;
          let packetsLost = 0;
          let jitterSeconds: number | undefined;
          let roundTripTimeSeconds: number | undefined;

          stats.forEach(stat => {
            if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
              bytesSent = maxNumber(bytesSent, numberValue(stat.bytesSent));
              packetsSent = maxNumber(packetsSent, numberValue(stat.packetsSent));
            }

            if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
              bytesReceived = maxNumber(bytesReceived, numberValue(stat.bytesReceived));
              packetsReceived = maxNumber(packetsReceived, numberValue(stat.packetsReceived));
              packetsLost = Math.max(packetsLost, numberValue(stat.packetsLost) ?? 0);
              jitterSeconds = numberValue(stat.jitter);
            }

            if (
              stat.type === 'candidate-pair' &&
              (stat as RTCIceCandidatePairStats).state === 'succeeded'
            ) {
              const candidatePair = stat as RTCIceCandidatePairStats;
              roundTripTimeSeconds = numberValue(candidatePair.currentRoundTripTime);
            }
          });

          const sample: WebRtcAudioQualitySample = {
            capturedAt: new Date().toISOString(),
            transportId: state.transport.id,
            direction: state.transport.direction,
            connectionState: state.transport.connectionState,
            iceGatheringState: state.transport.iceGatheringState,
            bytesSent,
            bytesReceived,
            packetsSent,
            packetsReceived,
            packetsLost,
            ...(jitterSeconds !== undefined ? { jitterSeconds } : {}),
            ...(roundTripTimeSeconds !== undefined ? { roundTripTimeSeconds } : {}),
          };

          state.previousBytesSent = bytesSent;
          state.previousBytesReceived = bytesReceived;
          this.listener(sample);
        } catch {
          // Stats are diagnostic and must never disrupt the audio session.
        }
      })
    );
  }
}
