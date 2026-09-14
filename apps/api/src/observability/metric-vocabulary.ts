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
  RealtimeConnectionErrorsTotal: 'asr_huddle_realtime_connection_errors_total',
  RealtimeCommandsTotal: 'asr_huddle_realtime_commands_total',
  RealtimeCommandsSucceededTotal: 'asr_huddle_realtime_commands_succeeded_total',
  RealtimeCommandsFailedTotal: 'asr_huddle_realtime_commands_failed_total',
  RealtimeProtocolViolationsTotal: 'asr_huddle_realtime_protocol_violations_total',
  RealtimeRateLimitedTotal: 'asr_huddle_realtime_rate_limited_total',
  DomainEventsPublishedTotal: 'asr_huddle_domain_events_published_total',
  ParticipantReconnectAttemptsTotal: 'asr_huddle_participant_reconnect_attempts_total',
  ParticipantReconnectsTotal: 'asr_huddle_participant_reconnects_total',
  ParticipantReconnectFailuresTotal: 'asr_huddle_participant_reconnect_failures_total',
  RoomsCreatedTotal: 'asr_huddle_rooms_created_total',
  RoomsEndedTotal: 'asr_huddle_rooms_ended_total',
  ParticipantsJoinedTotal: 'asr_huddle_participants_joined_total',
  ParticipantsLeftTotal: 'asr_huddle_participants_left_total',
  ParticipantsDisconnectedTotal: 'asr_huddle_participants_disconnected_total',
  ParticipantsRemovedTotal: 'asr_huddle_participants_removed_total',
  ParticipantRoleChangesTotal: 'asr_huddle_participant_role_changes_total',
  ModerationActionsTotal: 'asr_huddle_moderation_actions_total',
  SpeakerRequestsTotal: 'asr_huddle_speaker_requests_total',
  RealtimeCommandDurationMs: 'asr_huddle_realtime_command_duration_ms',
  ParticipantReconnectDurationMs: 'asr_huddle_participant_reconnect_duration_ms',
  DomainEventPublishDurationMs: 'asr_huddle_domain_event_publish_duration_ms',
  DependencyOperationsTotal: 'asr_huddle_dependency_operations_total',
  DependencyFailuresTotal: 'asr_huddle_dependency_failures_total',
  DependencyDurationMs: 'asr_huddle_dependency_duration_ms',
  HttpRequestsTotal: 'asr_huddle_http_requests_total',
  HttpRequestFailuresTotal: 'asr_huddle_http_request_failures_total',
  HttpRequestDurationMs: 'asr_huddle_http_request_duration_ms',
  ProcessResidentMemoryBytes: 'process_resident_memory_bytes',
  ProcessHeapUsedBytes: 'process_heap_used_bytes',
  ProcessHeapTotalBytes: 'process_heap_total_bytes',
  ProcessExternalMemoryBytes: 'process_external_memory_bytes',
  ProcessArrayBuffersBytes: 'process_array_buffers_bytes',
  ProcessUptimeSeconds: 'process_uptime_seconds',
  ProcessCpuUserSecondsTotal: 'process_cpu_user_seconds_total',
  ProcessCpuSystemSecondsTotal: 'process_cpu_system_seconds_total',
} as const;

export type RuntimeMetricNameValue = (typeof RuntimeMetricName)[keyof typeof RuntimeMetricName];

export const RuntimeMetricHelp: Record<RuntimeMetricNameValue, string> = {
  [RuntimeMetricName.ConnectionsActive]: 'Currently active realtime connections.',
  [RuntimeMetricName.ConnectionsOpenedTotal]: 'Total realtime connections opened.',
  [RuntimeMetricName.ConnectionsClosedTotal]: 'Total realtime connections closed.',
  [RuntimeMetricName.RealtimeConnectionErrorsTotal]: 'Total realtime connection errors observed.',
  [RuntimeMetricName.RealtimeCommandsTotal]: 'Total realtime commands received.',
  [RuntimeMetricName.RealtimeCommandsSucceededTotal]:
    'Total realtime commands completed successfully.',
  [RuntimeMetricName.RealtimeCommandsFailedTotal]:
    'Total realtime commands that returned an error.',
  [RuntimeMetricName.RealtimeProtocolViolationsTotal]: 'Total realtime protocol violations.',
  [RuntimeMetricName.RealtimeRateLimitedTotal]:
    'Total realtime operations rejected by rate limiting.',
  [RuntimeMetricName.DomainEventsPublishedTotal]: 'Total realtime domain events published.',
  [RuntimeMetricName.ParticipantReconnectAttemptsTotal]:
    'Total participant reconnect command attempts.',
  [RuntimeMetricName.ParticipantReconnectsTotal]:
    'Total participant reconnects completed successfully.',
  [RuntimeMetricName.ParticipantReconnectFailuresTotal]:
    'Total participant reconnect commands that failed.',
  [RuntimeMetricName.RoomsCreatedTotal]: 'Total rooms created.',
  [RuntimeMetricName.RoomsEndedTotal]: 'Total rooms ended.',
  [RuntimeMetricName.ParticipantsJoinedTotal]: 'Total participant joins.',
  [RuntimeMetricName.ParticipantsLeftTotal]: 'Total participant leaves.',
  [RuntimeMetricName.ParticipantsDisconnectedTotal]: 'Total participant disconnects.',
  [RuntimeMetricName.ParticipantsRemovedTotal]: 'Total participants removed by moderation.',
  [RuntimeMetricName.ParticipantRoleChangesTotal]: 'Total participant role changes.',
  [RuntimeMetricName.ModerationActionsTotal]: 'Total participant moderation actions.',
  [RuntimeMetricName.SpeakerRequestsTotal]: 'Total speaker requests created.',
  [RuntimeMetricName.RealtimeCommandDurationMs]:
    'Realtime command handling duration in milliseconds.',
  [RuntimeMetricName.ParticipantReconnectDurationMs]:
    'Participant reconnect command duration in milliseconds.',
  [RuntimeMetricName.DomainEventPublishDurationMs]:
    'Domain event publication duration in milliseconds.',
  [RuntimeMetricName.DependencyOperationsTotal]: 'Total dependency operations.',
  [RuntimeMetricName.DependencyFailuresTotal]: 'Total dependency operation failures.',
  [RuntimeMetricName.DependencyDurationMs]: 'Dependency operation duration in milliseconds.',
  [RuntimeMetricName.HttpRequestsTotal]: 'Total HTTP requests.',
  [RuntimeMetricName.HttpRequestFailuresTotal]: 'Total HTTP requests completed with a 5xx status.',
  [RuntimeMetricName.HttpRequestDurationMs]: 'HTTP request duration in milliseconds.',
  [RuntimeMetricName.ProcessResidentMemoryBytes]: 'Resident process memory in bytes.',
  [RuntimeMetricName.ProcessHeapUsedBytes]: 'Used V8 heap in bytes.',
  [RuntimeMetricName.ProcessHeapTotalBytes]: 'Allocated V8 heap in bytes.',
  [RuntimeMetricName.ProcessExternalMemoryBytes]: 'External memory in bytes.',
  [RuntimeMetricName.ProcessArrayBuffersBytes]: 'ArrayBuffer memory in bytes.',
  [RuntimeMetricName.ProcessUptimeSeconds]: 'Process uptime in seconds.',
  [RuntimeMetricName.ProcessCpuUserSecondsTotal]: 'Process user CPU time in seconds.',
  [RuntimeMetricName.ProcessCpuSystemSecondsTotal]: 'Process system CPU time in seconds.',
};

export const RuntimeLogEvent = {
  RealtimeCommandCompleted: 'realtime_command_completed',
  RealtimeProtocolViolation: 'realtime_protocol_violation',
  RealtimeConnectionOpened: 'realtime_connection_opened',
  RealtimeConnectionClosed: 'realtime_connection_closed',
  RealtimeConnectionError: 'realtime_connection_error',
  RealtimeDisconnectPersistFailed: 'realtime_disconnect_persist_failed',
  RealtimeDisconnectPersistRecovered: 'realtime_disconnect_persist_recovered',
  RealtimeDisconnectPersistExhausted: 'realtime_disconnect_persist_exhausted',
  RealtimeEventPublishFailed: 'realtime_event_publish_failed',
  RealtimeEventPublished: 'realtime_event_published',
  DependencyOperationFailed: 'dependency_operation_failed',
  HttpRequestCompleted: 'http_request_completed',
} as const;

export type RuntimeLogEventValue = (typeof RuntimeLogEvent)[keyof typeof RuntimeLogEvent];
