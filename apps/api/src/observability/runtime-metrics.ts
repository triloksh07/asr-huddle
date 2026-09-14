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

/**
 * Small in-process metrics registry used by the runtime.
 *
 * This is deliberately not a replacement for a metrics backend. It keeps the
 * runtime observable without introducing a second monitoring architecture and
 * exposes Prometheus text for the existing /metrics endpoint.
 */
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
      throw new Error(`Histogram buckets must be finite, non-negative and unique.`);
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
      state.buckets.some((bucket, i) => bucket !== normalizedBuckets[i])
    ) {
      throw new Error(`Histogram buckets cannot change after first observation: ${metricName}`);
    }

    state.count += 1;
    state.sum += value;
    for (let index = 0; index < state.buckets.length; index += 1) {
      if (value <= state.buckets[index]) state.counts[index] += 1;
    }
  }

  /** Existing API retained for current instrumentation call sites. */
  recordConnectionOpened(): void {
    this.incrementCounter(RuntimeMetricName.ConnectionsOpenedTotal);
  }

  /** Existing API retained for current instrumentation call sites. */
  recordConnectionClosed(): void {
    this.incrementCounter(RuntimeMetricName.ConnectionsClosedTotal);
  }

  /** Existing API retained for current instrumentation call sites. */
  recordCommand(ok: boolean): void {
    this.incrementCounter(RuntimeMetricName.RealtimeCommandsTotal);
    this.incrementCounter(
      ok
        ? RuntimeMetricName.RealtimeCommandsSucceededTotal
        : RuntimeMetricName.RealtimeCommandsFailedTotal
    );
  }

  /** Existing API retained for current instrumentation call sites. */
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

  recordProtocolViolation(): void {
    this.incrementCounter(RuntimeMetricName.RealtimeProtocolViolationsTotal);
  }

  recordRateLimited(): void {
    this.incrementCounter(RuntimeMetricName.RealtimeRateLimitedTotal);
  }

  prometheus(registry: ConnectionRegistry): string {
    this.setGauge(RuntimeMetricName.ConnectionsActive, registry.size());
    this.setGauge(RuntimeMetricName.ProcessResidentMemoryBytes, process.memoryUsage().rss);

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
    for (const [name, state] of this.histograms) {
      emitHelp(name, 'histogram');
      let cumulative = 0;
      state.buckets.forEach((bucket, index) => {
        cumulative = state.counts[index];
        lines.push(`${name}_bucket{le="${escapeLabelValue(String(bucket))}"} ${cumulative}`);
      });
      lines.push(`${name}_bucket{le="+Inf"} ${state.count}`);
      lines.push(`${name}_sum ${state.sum}`);
      lines.push(`${name}_count ${state.count}`);
    }

    return `${lines.join('\n')}\n`;
  }
}
