export interface LogContext {
  requestId?: string;
  connectionId?: string;
  userId?: string;
  roomId?: string;
  participantId?: string;
  participantSessionId?: string;
  command?: string;
  durationMs?: number;
  result?: string;
  errorCode?: string;
}

export type LogFields = LogContext & Record<string, unknown>;

function serializeError(error: Error): Record<string, string> {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
  };
}

function normalizeFields(fields: LogFields): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Error) {
      normalized[key] = serializeError(value);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

/**
 * JSON logger with a stable correlation vocabulary.
 *
 * Secrets, access tokens and raw WebRTC protocol payloads are intentionally
 * not part of LogContext. Callers should log identifiers and outcome data,
 * not authentication material or high-volume protocol blobs.
 */
export class StructuredLogger {
  info(event: string, fields: LogFields = {}): void {
    this.write('info', event, fields);
  }

  error(event: string, fields: LogFields = {}): void {
    this.write('error', event, fields);
  }

  private write(level: 'info' | 'error', event: string, fields: LogFields): void {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...normalizeFields(fields),
    };
    const line = JSON.stringify(record);
    if (level === 'error') console.error(line);
    else console.log(line);
  }
}
