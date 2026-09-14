export const SfuMetricName = {
  WorkerFailuresTotal: 'asr_huddle_sfu_worker_failures_total',
  RouterCreationsTotal: 'asr_huddle_sfu_router_creations_total',
  RouterFailuresTotal: 'asr_huddle_sfu_router_failures_total',
  TransportFailuresTotal: 'asr_huddle_sfu_transport_failures_total',
  ProducerFailuresTotal: 'asr_huddle_sfu_producer_failures_total',
  ConsumerFailuresTotal: 'asr_huddle_sfu_consumer_failures_total',
  MediaOperationFailuresTotal: 'asr_huddle_sfu_media_operation_failures_total',
  MediaOperationDurationMs: 'asr_huddle_sfu_media_operation_duration_ms',
  RealtimePublicationFailuresTotal: 'asr_huddle_sfu_realtime_publication_failures_total',
} as const;

type CounterName = (typeof SfuMetricName)[keyof typeof SfuMetricName];

export class SfuOperationalMetrics {
  private readonly counters = new Map<CounterName, number>();
  private readonly durationSamples: number[] = [];

  increment(name: CounterName, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  observeDuration(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.durationSamples.push(durationMs);
    if (this.durationSamples.length > 4096) this.durationSamples.shift();
  }

  exposition(): string {
    const lines: string[] = [];
    for (const [name, value] of this.counters) lines.push(`${name} ${value}`);
    const samples = [...this.durationSamples].sort((a, b) => a - b);
    if (samples.length) {
      const sum = samples.reduce((total, value) => total + value, 0);
      lines.push(`${SfuMetricName.MediaOperationDurationMs}_count ${samples.length}`);
      lines.push(`${SfuMetricName.MediaOperationDurationMs}_sum ${sum}`);
    }
    return lines.join('\n');
  }
}
