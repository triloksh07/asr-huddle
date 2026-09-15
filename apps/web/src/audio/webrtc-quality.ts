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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

interface AudioRtpTotals {
  bytesSent: number;
  bytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
  jitterSeconds?: number;
  roundTripTimeSeconds?: number;
}

function readAudioStats(stats: RTCStatsReport): AudioRtpTotals {
  const totals: AudioRtpTotals = {
    bytesSent: 0,
    bytesReceived: 0,
    packetsSent: 0,
    packetsReceived: 0,
    packetsLost: 0,
  };

  stats.forEach(stat => {
    if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
      totals.bytesSent += finiteNumber(stat.bytesSent) ?? 0;
      totals.packetsSent += finiteNumber(stat.packetsSent) ?? 0;
    }

    if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
      totals.bytesReceived += finiteNumber(stat.bytesReceived) ?? 0;
      totals.packetsReceived += finiteNumber(stat.packetsReceived) ?? 0;
      totals.packetsLost += finiteNumber(stat.packetsLost) ?? 0;

      const jitter = finiteNumber(stat.jitter);
      if (jitter !== undefined) {
        totals.jitterSeconds =
          totals.jitterSeconds === undefined ? jitter : Math.max(totals.jitterSeconds, jitter);
      }
    }

    if (
      stat.type === 'candidate-pair' &&
      (stat as RTCIceCandidatePairStats).state === 'succeeded'
    ) {
      const roundTripTime = finiteNumber((stat as RTCIceCandidatePairStats).currentRoundTripTime);

      if (roundTripTime !== undefined) {
        totals.roundTripTimeSeconds =
          totals.roundTripTimeSeconds === undefined
            ? roundTripTime
            : Math.max(totals.roundTripTimeSeconds, roundTripTime);
      }
    }
  });

  return totals;
}

export type WebRtcAudioQualityListener = (sample: WebRtcAudioQualitySample) => void;

export class WebRtcAudioQualityCollector {
  private readonly transports = new Map<string, types.Transport>();
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
    this.transports.set(transport.id, transport);
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

    await Promise.all(
      [...this.transports.values()].map(async transport => {
        if (transport.closed) {
          this.removeTransport(transport.id);
          return;
        }

        try {
          const stats = await transport.getStats();
          const totals = readAudioStats(stats);

          this.listener({
            capturedAt: new Date().toISOString(),
            transportId: transport.id,
            direction: transport.direction,
            connectionState: transport.connectionState,
            iceGatheringState: transport.iceGatheringState,
            bytesSent: totals.bytesSent,
            bytesReceived: totals.bytesReceived,
            packetsSent: totals.packetsSent,
            packetsReceived: totals.packetsReceived,
            packetsLost: totals.packetsLost,
            ...(totals.jitterSeconds !== undefined ? { jitterSeconds: totals.jitterSeconds } : {}),
            ...(totals.roundTripTimeSeconds !== undefined
              ? { roundTripTimeSeconds: totals.roundTripTimeSeconds }
              : {}),
          });
        } catch {
          // Quality telemetry is diagnostic-only and must never interrupt media.
        }
      })
    );
  }
}
