/**
 * Canonical low-cardinality metric names for the ASR Huddle runtime.
 *
 * IDs such as roomId, userId, participantId, connectionId and requestId must
 * never be metric labels. They belong in structured logs instead.
 */
export const RuntimeMetricName = {
  ConnectionsActive: 'asr_huddle_connections_active',
  ConnectionsOpenedTotal: 'asr_huddle_connections_opened_total',
  ConnectionsClosedTotal: 'asr_huddle_connections_closed_total',
  RealtimeCommandsTotal: 'asr_huddle_realtime_commands_total',
  RealtimeCommandsSucceededTotal: 'asr_huddle_realtime_commands_succeeded_total',
  RealtimeCommandsFailedTotal: 'asr_huddle_realtime_commands_failed_total',
  RealtimeProtocolViolationsTotal: 'asr_huddle_realtime_protocol_violations_total',
  RealtimeRateLimitedTotal: 'asr_huddle_realtime_rate_limited_total',
  DomainEventsPublishedTotal: 'asr_huddle_domain_events_published_total',
  ParticipantReconnectsTotal: 'asr_huddle_participant_reconnects_total',
  RoomsEndedTotal: 'asr_huddle_rooms_ended_total',
  ProcessResidentMemoryBytes: 'process_resident_memory_bytes',
} as const;

export type RuntimeMetricNameValue = (typeof RuntimeMetricName)[keyof typeof RuntimeMetricName];

export const RuntimeMetricHelp: Record<RuntimeMetricNameValue, string> = {
  [RuntimeMetricName.ConnectionsActive]: 'Currently active realtime connections.',
  [RuntimeMetricName.ConnectionsOpenedTotal]: 'Total realtime connections opened.',
  [RuntimeMetricName.ConnectionsClosedTotal]: 'Total realtime connections closed.',
  [RuntimeMetricName.RealtimeCommandsTotal]: 'Total realtime commands received.',
  [RuntimeMetricName.RealtimeCommandsSucceededTotal]:
    'Total realtime commands completed successfully.',
  [RuntimeMetricName.RealtimeCommandsFailedTotal]:
    'Total realtime commands that returned an error.',
  [RuntimeMetricName.RealtimeProtocolViolationsTotal]: 'Total realtime protocol violations.',
  [RuntimeMetricName.RealtimeRateLimitedTotal]:
    'Total realtime operations rejected by rate limiting.',
  [RuntimeMetricName.DomainEventsPublishedTotal]: 'Total realtime domain events published.',
  [RuntimeMetricName.ParticipantReconnectsTotal]: 'Total participant reconnects.',
  [RuntimeMetricName.RoomsEndedTotal]: 'Total rooms ended.',
  [RuntimeMetricName.ProcessResidentMemoryBytes]: 'Resident process memory in bytes.',
};

/**
 * Event vocabulary starts small and intentionally remains implementation-level.
 * Feature-specific lifecycle events are added in the instrumentation batches.
 */
export const RuntimeLogEvent = {
  RealtimeCommandCompleted: 'realtime_command_completed',
  RealtimeProtocolViolation: 'realtime_protocol_violation',
  RealtimeConnectionOpened: 'realtime_connection_opened',
  RealtimeConnectionClosed: 'realtime_connection_closed',
  RealtimeDisconnectPersistFailed: 'realtime_disconnect_persist_failed',
  RealtimeDisconnectPersistRecovered: 'realtime_disconnect_persist_recovered',
  RealtimeDisconnectPersistExhausted: 'realtime_disconnect_persist_exhausted',
  RealtimeEventPublishFailed: 'realtime_event_publish_failed',
  RealtimeEventPublished: 'realtime_event_published',
  DependencyFailure: 'dependency_failure',
} as const;

export type RuntimeLogEventValue = (typeof RuntimeLogEvent)[keyof typeof RuntimeLogEvent];
