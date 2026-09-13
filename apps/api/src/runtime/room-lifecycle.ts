import type { ProcessRoomLifecycle, RoomLifecycleResult } from '@repo/application';
import { clearRoomSessionBinding } from '../realtime/types.js';
import type { ConnectionRegistry } from '../realtime/connection-registry.js';
import type { MediaController } from '../media/media-controller.js';
export interface RoomLifecycleRuntime {
  runOnce(): Promise<RoomLifecycleResult>;
  terminateRoom(roomId: string, reason: string): Promise<void>;
  start(): void;
  stop(): void;
}
export class ApiRoomLifecycleRuntime implements RoomLifecycleRuntime {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(
    private readonly lifecycle: ProcessRoomLifecycle,
    private readonly registry: ConnectionRegistry,
    private readonly media: MediaController,
    private readonly intervalMs: number
  ) {}
  async runOnce(): Promise<RoomLifecycleResult> {
    if (this.running) return { warningsIssued: 0, endedRooms: [] };
    this.running = true;
    try {
      const result = await this.lifecycle.execute();
      // The instance that made the durable decision must also tear down its local ephemeral resources.
      // Redis fanout remains responsible for notifying/tearing down other API instances.
      for (const ended of result.endedRooms) await this.terminateRoom(ended.roomId, ended.reason);
      return result;
    } finally {
      this.running = false;
    }
  }
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch(error => console.error('Room lifecycle evaluation failed.', error));
    }, this.intervalMs);
    this.timer.unref();
    void this.runOnce().catch(error =>
      console.error('Initial room lifecycle evaluation failed.', error)
    );
  }
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
  async terminateRoom(roomId: string, reason: string): Promise<void> {
    const connections = this.registry.getByRoom(
      roomId as Parameters<ConnectionRegistry['getByRoom']>[0]
    );
    await Promise.all(
      connections.map(async connection => {
        try {
          await connection.transport.send({
            requestId: `room-ended-${connection.connectionId}`,
            type: 'room.ended',
            ok: true,
            payload: { roomId, reason },
          });
        } catch (error) {
          console.error('Failed to notify participant that their room ended.', error);
        }
        if (
          connection.roomSessionId &&
          connection.participantId &&
          connection.participantSessionId
        ) {
          try {
            await this.media.closeParticipant({
              roomId: connection.roomId!,
              roomSessionId: connection.roomSessionId,
              participantId: connection.participantId,
              participantSessionId: connection.participantSessionId,
              connectionId: connection.connectionId,
            });
          } catch (error) {
            console.error('Failed to close media for ended room participant.', error);
          }
        }
        clearRoomSessionBinding(connection);
        this.registry.remove(connection.connectionId);
        try {
          await connection.transport.close(4001, 'Room ended');
        } catch (error) {
          console.error('Failed to close connection for ended room.', error);
        }
      })
    );
  }
}
