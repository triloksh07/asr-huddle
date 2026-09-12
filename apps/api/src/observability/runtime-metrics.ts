import type { ConnectionRegistry } from "../realtime/connection-registry.js";

export class RuntimeMetrics {
  private opened = 0; private closed = 0; private succeeded = 0; private failed = 0;
  private events = 0; private reconnects = 0; private roomEnds = 0;
  recordConnectionOpened() { this.opened += 1; }
  recordConnectionClosed() { this.closed += 1; }
  recordCommand(ok: boolean) { if (ok) this.succeeded += 1; else this.failed += 1; }
  recordEvent(type: string) {
    this.events += 1;
    if (type === "participant.reconnected") this.reconnects += 1;
    if (type === "room.ended") this.roomEnds += 1;
  }
  prometheus(registry: ConnectionRegistry): string {
    const values: Array<[string, number]> = [
      ["asr_huddle_connections_active", registry.size()], ["asr_huddle_connections_opened_total", this.opened],
      ["asr_huddle_connections_closed_total", this.closed], ["asr_huddle_realtime_commands_succeeded_total", this.succeeded],
      ["asr_huddle_realtime_commands_failed_total", this.failed], ["asr_huddle_domain_events_published_total", this.events],
      ["asr_huddle_participant_reconnects_total", this.reconnects], ["asr_huddle_rooms_ended_total", this.roomEnds],
      ["process_resident_memory_bytes", process.memoryUsage().rss],
    ];
    return values.map(([name, value]) => `${name} ${value}`).join("\n") + "\n";
  }
}
