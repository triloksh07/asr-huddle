export const SfuMetricName = {
  WorkersActive: 'asr_huddle_sfu_workers_active',
  WorkerFailuresTotal: 'asr_huddle_sfu_worker_failures_total',
  RouterCreationsTotal: 'asr_huddle_sfu_router_creations_total',
  RouterFailuresTotal: 'asr_huddle_sfu_router_failures_total',
  TransportFailuresTotal: 'asr_huddle_sfu_transport_failures_total',
  ProducerFailuresTotal: 'asr_huddle_sfu_producer_failures_total',
  ConsumerFailuresTotal: 'asr_huddle_sfu_consumer_failures_total',
  MediaOperationFailuresTotal: 'asr_huddle_sfu_media_operation_failures_total',
  MediaOperationDurationMs: 'asr_huddle_sfu_media_operation_duration_ms',
  RealtimePublicationFailuresTotal: 'asr_huddle_sfu_realtime_publication_failures_total',
  ProcessResidentMemoryBytes: 'process_resident_memory_bytes',
  ProcessHeapUsedBytes: 'process_heap_used_bytes',
  ProcessHeapTotalBytes: 'process_heap_total_bytes',
  ProcessExternalMemoryBytes: 'process_external_memory_bytes',
  ProcessArrayBuffersBytes: 'process_array_buffers_bytes',
  ProcessUptimeSeconds: 'process_uptime_seconds',
  ProcessCpuUserSecondsTotal: 'process_cpu_user_seconds_total',
  ProcessCpuSystemSecondsTotal: 'process_cpu_system_seconds_total',
} as const;

type SfuCounterName =
  | typeof SfuMetricName.WorkerFailuresTotal
  | typeof SfuMetricName.RouterCreationsTotal
  | typeof SfuMetricName.RouterFailuresTotal
  | typeof SfuMetricName.TransportFailuresTotal
  | typeof SfuMetricName.ProducerFailuresTotal
  | typeof SfuMetricName.ConsumerFailuresTotal
  | typeof SfuMetricName.MediaOperationFailuresTotal
  | typeof SfuMetricName.RealtimePublicationFailuresTotal;

type SfuGaugeName =
  | typeof SfuMetricName.WorkersActive
  | typeof SfuMetricName.ProcessResidentMemoryBytes
  | typeof SfuMetricName.ProcessHeapUsedBytes
  | typeof SfuMetricName.ProcessHeapTotalBytes
  | typeof SfuMetricName.ProcessExternalMemoryBytes
  | typeof SfuMetricName.ProcessArrayBuffersBytes
  | typeof SfuMetricName.ProcessUptimeSeconds;

interface HistogramState {
  readonly buckets: readonly number[];
  readonly counts: number[];
  sum: number;
  count: number;
}

const DEFAULT_DURATION_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000];

function sanitizeMetricName(name: string): string {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
    throw new Error(`Invalid Prometheus metric name: ${name}`);
  }
  return name;
}

function validateBuckets(buckets: readonly number[]): number[] {
  const normalized = [...buckets].sort((a, b) => a - b);

  if (
    normalized.length === 0 ||
    normalized.some(
      (bucket, index) =>
        !Number.isFinite(bucket) || bucket < 0 || (index > 0 && bucket === normalized[index - 1])
    )
  ) {
    throw new Error('Histogram buckets must be finite, non-negative and unique.');
  }

  return normalized;
}

export class SfuOperationalMetrics {
  private readonly counters = new Map<SfuCounterName, number>();
  private readonly gauges = new Map<SfuGaugeName, number>();
  private readonly histograms = new Map<string, HistogramState>();

  increment(name: SfuCounterName, value = 1): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Counter increment must be finite and non-negative: ${value}`);
    }

    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  setGauge(name: SfuGaugeName, value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Gauge value must be finite: ${value}`);
    }

    this.gauges.set(name, value);
  }

  incrementGauge(name: SfuGaugeName, value = 1): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Gauge increment must be finite: ${value}`);
    }

    this.gauges.set(name, (this.gauges.get(name) ?? 0) + value);
  }

  observeDuration(durationMs: number, buckets = DEFAULT_DURATION_BUCKETS): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;

    const normalized = validateBuckets(buckets);
    const metricName = sanitizeMetricName(SfuMetricName.MediaOperationDurationMs);

    let state = this.histograms.get(metricName);

    if (!state) {
      state = {
        buckets: normalized,
        counts: new Array(normalized.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.histograms.set(metricName, state);
    }

    if (
      state.buckets.length !== normalized.length ||
      state.buckets.some((bucket, index) => bucket !== normalized[index])
    ) {
      throw new Error('Histogram buckets cannot change after first observation.');
    }

    state.count += 1;
    state.sum += durationMs;

    for (let index = 0; index < state.buckets.length; index += 1) {
      if (durationMs <= state.buckets[index]) {
        state.counts[index] += 1;
      }
    }
  }

  exposition(): string {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    this.setGauge(SfuMetricName.ProcessResidentMemoryBytes, memory.rss);
    this.setGauge(SfuMetricName.ProcessHeapUsedBytes, memory.heapUsed);
    this.setGauge(SfuMetricName.ProcessHeapTotalBytes, memory.heapTotal);
    this.setGauge(SfuMetricName.ProcessExternalMemoryBytes, memory.external);
    this.setGauge(SfuMetricName.ProcessArrayBuffersBytes, memory.arrayBuffers);
    this.setGauge(SfuMetricName.ProcessUptimeSeconds, process.uptime());

    const lines: string[] = [];
    const emittedHelp = new Set<string>();

    const emitHelp = (
      name: string,
      description: string,
      type: 'counter' | 'gauge' | 'histogram'
    ): void => {
      if (emittedHelp.has(name)) return;

      lines.push(`# HELP ${name} ${description}`, `# TYPE ${name} ${type}`);
      emittedHelp.add(name);
    };

    for (const [name, value] of this.counters) {
      emitHelp(name, `${name} runtime metric.`, 'counter');
      lines.push(`${name} ${value}`);
    }

    for (const [name, value] of this.gauges) {
      emitHelp(name, `${name} runtime metric.`, 'gauge');
      lines.push(`${name} ${value}`);
    }

    emitHelp(
      SfuMetricName.ProcessCpuUserSecondsTotal,
      'Process user CPU time in seconds.',
      'counter'
    );
    lines.push(`${SfuMetricName.ProcessCpuUserSecondsTotal} ${cpu.user / 1_000_000}`);

    emitHelp(
      SfuMetricName.ProcessCpuSystemSecondsTotal,
      'Process system CPU time in seconds.',
      'counter'
    );
    lines.push(`${SfuMetricName.ProcessCpuSystemSecondsTotal} ${cpu.system / 1_000_000}`);

    for (const [name, state] of this.histograms) {
      emitHelp(name, `${name} runtime metric.`, 'histogram');

      for (let index = 0; index < state.buckets.length; index += 1) {
        lines.push(`${name}_bucket{le="${state.buckets[index]}"} ${state.counts[index]}`);
      }

      lines.push(
        `${name}_bucket{le="+Inf"} ${state.count}`,
        `${name}_sum ${state.sum}`,
        `${name}_count ${state.count}`
      );
    }

    return `${lines.join('\n')}\n`;
  }
}
