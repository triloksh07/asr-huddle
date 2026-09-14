import type { ConnectionRegistry } from '../realtime/connection-registry.js';
import {
  RuntimeMetricHelp,
  RuntimeMetricName,
  type RuntimeMetricNameValue,
} from './metric-vocabulary.js';

type MetricKind = 'counter' | 'gauge' | 'histogram';

interface HistogramState {
  readonly buckets: readonly number[];
  readonly counts: number[];
  sum: number;
  count: number;
}

const DEFAULT_HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function sanitizeMetricName(name: string): string {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
    throw new Error(`Invalid Prometheus metric name: ${name}`);
  }
  return name;
}

export class RuntimeMetrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramState>();

  incrementCounter(name: string, value = 1): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Counter increment must be a finite non-negative number: ${value}`);
    }
    const metricName = sanitizeMetricName(name);
    this.counters.set(metricName, (this.counters.get(metricName) ?? 0) + value);
  }

  setGauge(name: string, value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Gauge value must be finite: ${value}`);
    }
    this.gauges.set(sanitizeMetricName(name), value);
  }

  incrementGauge(name: string, value = 1): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Gauge increment must be finite: ${value}`);
    }
    const metricName = sanitizeMetricName(name);
    this.gauges.set(metricName, (this.gauges.get(metricName) ?? 0) + value);
  }

  observeHistogram(name: string, value: number, buckets = DEFAULT_HISTOGRAM_BUCKETS): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Histogram value must be a finite non-negative number: ${value}`);
    }

    const metricName = sanitizeMetricName(name);
    const normalizedBuckets = [...buckets].sort((a, b) => a - b);

    if (
      normalizedBuckets.length === 0 ||
      normalizedBuckets.some(
        (bucket, index) =>
          !Number.isFinite(bucket) ||
          bucket < 0 ||
          (index > 0 && bucket === normalizedBuckets[index - 1])
      )
    ) {
      throw new Error('Histogram buckets must be finite, non-negative and unique.');
    }

    let state = this.histograms.get(metricName);
    if (!state) {
      state = {
        buckets: normalizedBuckets,
        counts: new Array(normalizedBuckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.histograms.set(metricName, state);
    }

    if (
      state.buckets.length !== normalizedBuckets.length ||
      state.buckets.some((bucket, index) => bucket !== normalizedBuckets[index])
    ) {
      throw new Error(`Histogram buckets cannot change after first observation: ${metricName}`);
    }

    state.count += 1;
    state.sum += value;

    for (let index = 0; index < state.buckets.length; index += 1) {
      if (value <= state.buckets[index]) state.counts[index] += 1;
    }
  }

  recordConnectionOpened(): void {
    this.incrementCounter(RuntimeMetricName.ConnectionsOpenedTotal);
  }

  recordConnectionClosed(): void {
    this.incrementCounter(RuntimeMetricName.ConnectionsClosedTotal);
  }

  recordConnectionError(): void {
    this.incrementCounter(RuntimeMetricName.RealtimeConnectionErrorsTotal);
  }

  recordCommand(ok: boolean): void {
    this.incrementCounter(RuntimeMetricName.RealtimeCommandsTotal);
    this.incrementCounter(
      ok
        ? RuntimeMetricName.RealtimeCommandsSucceededTotal
        : RuntimeMetricName.RealtimeCommandsFailedTotal
    );
  }

  recordEvent(type: string): void {
    this.incrementCounter(RuntimeMetricName.DomainEventsPublishedTotal);

    switch (type) {
      case 'room.created':
        this.incrementCounter(RuntimeMetricName.RoomsCreatedTotal);
        break;
      case 'room.ended':
        this.incrementCounter(RuntimeMetricName.RoomsEndedTotal);
        break;
      case 'participant.joined':
        this.incrementCounter(RuntimeMetricName.ParticipantsJoinedTotal);
        break;
      case 'participant.left':
        this.incrementCounter(RuntimeMetricName.ParticipantsLeftTotal);
        break;
      case 'participant.disconnected':
        this.incrementCounter(RuntimeMetricName.ParticipantsDisconnectedTotal);
        break;
      case 'participant.reconnected':
        this.incrementCounter(RuntimeMetricName.ParticipantReconnectsTotal);
        break;
      case 'participant.removed':
        this.incrementCounter(RuntimeMetricName.ParticipantsRemovedTotal);
        this.incrementCounter(RuntimeMetricName.ModerationActionsTotal);
        break;
      case 'participant.role.changed':
        this.incrementCounter(RuntimeMetricName.ParticipantRoleChangesTotal);
        break;
      case 'participant.self_mute.changed':
      case 'participant.moderation.mute.changed':
        this.incrementCounter(RuntimeMetricName.ModerationActionsTotal);
        break;
      case 'speaker.request.created':
        this.incrementCounter(RuntimeMetricName.SpeakerRequestsTotal);
        break;
    }
  }

  recordReconnectAttempt(): void {
    this.incrementCounter(RuntimeMetricName.ParticipantReconnectAttemptsTotal);
  }

  recordReconnectFailure(): void {
    this.incrementCounter(RuntimeMetricName.ParticipantReconnectFailuresTotal);
  }

  recordProtocolViolation(): void {
    this.incrementCounter(RuntimeMetricName.RealtimeProtocolViolationsTotal);
  }

  recordRateLimited(): void {
    this.incrementCounter(RuntimeMetricName.RealtimeRateLimitedTotal);
  }

  recordDependency(dependency: string, operation: string, ok: boolean, durationMs: number): void {
    this.incrementCounter(RuntimeMetricName.DependencyOperationsTotal);
    if (!ok) this.incrementCounter(RuntimeMetricName.DependencyFailuresTotal);
    this.observeHistogram(RuntimeMetricName.DependencyDurationMs, durationMs);
    this.incrementCounter(
      `asr_huddle_dependency_${dependency}_${operation}_${ok ? 'success' : 'failure'}_total`
    );
  }

  recordHttpRequest(statusCode: number, durationMs: number): void {
    this.incrementCounter(RuntimeMetricName.HttpRequestsTotal);
    if (statusCode >= 500) this.incrementCounter(RuntimeMetricName.HttpRequestFailuresTotal);
    this.observeHistogram(RuntimeMetricName.HttpRequestDurationMs, durationMs);
  }

  recordProcessResources(): void {
    const memory = process.memoryUsage();
    this.setGauge(RuntimeMetricName.ProcessResidentMemoryBytes, memory.rss);
    this.setGauge(RuntimeMetricName.ProcessHeapUsedBytes, memory.heapUsed);
    this.setGauge(RuntimeMetricName.ProcessHeapTotalBytes, memory.heapTotal);
    this.setGauge(RuntimeMetricName.ProcessExternalMemoryBytes, memory.external);
    this.setGauge(RuntimeMetricName.ProcessArrayBuffersBytes, memory.arrayBuffers);
    this.setGauge(RuntimeMetricName.ProcessUptimeSeconds, process.uptime());
  }

  prometheus(registry: ConnectionRegistry): string {
    this.setGauge(RuntimeMetricName.ConnectionsActive, registry.size());
    this.recordProcessResources();

    const lines: string[] = [];
    const emittedHelp = new Set<string>();

    const emitHelp = (name: string, kind: MetricKind): void => {
      if (emittedHelp.has(name)) return;
      const help = RuntimeMetricHelp[name as RuntimeMetricNameValue] ?? `${name} runtime metric.`;
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${kind}`);
      emittedHelp.add(name);
    };

    for (const [name, value] of this.counters) {
      emitHelp(name, 'counter');
      lines.push(`${name} ${value}`);
    }

    for (const [name, value] of this.gauges) {
      emitHelp(name, 'gauge');
      lines.push(`${name} ${value}`);
    }

    const cpu = process.cpuUsage();
    lines.push(
      `# HELP ${RuntimeMetricName.ProcessCpuUserSecondsTotal} Process user CPU time in seconds.`,
      `# TYPE ${RuntimeMetricName.ProcessCpuUserSecondsTotal} counter`,
      `${RuntimeMetricName.ProcessCpuUserSecondsTotal} ${cpu.user / 1_000_000}`,
      `# HELP ${RuntimeMetricName.ProcessCpuSystemSecondsTotal} Process system CPU time in seconds.`,
      `# TYPE ${RuntimeMetricName.ProcessCpuSystemSecondsTotal} counter`,
      `${RuntimeMetricName.ProcessCpuSystemSecondsTotal} ${cpu.system / 1_000_000}`
    );

    for (const [name, state] of this.histograms) {
      emitHelp(name, 'histogram');
      for (let index = 0; index < state.buckets.length; index += 1) {
        lines.push(
          `${name}_bucket{le="${escapeLabelValue(String(state.buckets[index]))}"} ${state.counts[index]}`
        );
      }
      lines.push(`${name}_bucket{le="+Inf"} ${state.count}`);
      lines.push(`${name}_sum ${state.sum}`);
      lines.push(`${name}_count ${state.count}`);
    }

    return `${lines.join('\n')}\n`;
  }
}
