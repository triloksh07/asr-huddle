import type { ConnectionId } from "@repo/domain";
import type { DisconnectRoom } from "@repo/application";
import { randomUUID } from "node:crypto";
import { CommandRouter } from "./command-router.js";
import { ConnectionRegistry } from "./connection-registry.js";
import {
  createAuthenticatedConnection,
  type RealtimeAuthenticator,
} from "./authenticated-connection.js";
import { createRealtimeSession } from "./ws-session.js";
import type { RealtimeTransport } from "./types.js";
import { clearRoomSessionBinding } from "./types.js";

export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
}

export interface RealtimeRuntime {
  accept(socket: WebSocketLike, request: unknown): Promise<void>;
}

export function createRealtimeRuntime(
  router: CommandRouter,
  registry: ConnectionRegistry,
  authenticator: RealtimeAuthenticator,
  disconnectRoom: DisconnectRoom,
  disconnectRecoveryMs: number,
): RealtimeRuntime {
  return {
    async accept(socket, request): Promise<void> {
      const userId = await authenticator.authenticate(request);
      const connectionId = randomUUID() as ConnectionId;

      const transport: RealtimeTransport = {
        async send(response) {
          socket.send(JSON.stringify(response));
        },
        async close(code, reason) {
          socket.close(code, reason);
        },
      };

      const authenticated = createAuthenticatedConnection(
        connectionId,
        userId,
        transport,
      );

      const session = createRealtimeSession(
        authenticated.connection.connectionId,
        authenticated.connection.userId,
        authenticated.transport,
        router,
        registry,
      );

      let lifecycleFinalized = false;

      const finalizeConnection = async (): Promise<void> => {
        if (lifecycleFinalized) return;
        lifecycleFinalized = true;

        const registered = registry.get(connectionId);
        if (!registered) return;

        const { participantId, participantSessionId } = registered;

        if (participantId && participantSessionId) {
          try {
            await disconnectRoom.execute({
              participantId,
              participantSessionId,
              recoverableForMs: disconnectRecoveryMs,
            });
          } catch (error) {
            console.error(
              `Failed to persist disconnect for connection ${connectionId}.`,
              error,
            );
          }
        }

        clearRoomSessionBinding(registered);
        registry.remove(connectionId);
      };

      socket.on("message", async (data) => {
        try {
          const raw = typeof data === "string" ? JSON.parse(data) : data;
          await session.receive(raw);
        } catch {
          await transport.send({
            requestId: "unknown",
            type: "error",
            ok: false,
            error: {
              code: "INVALID_MESSAGE",
              message: "Message must contain valid JSON.",
            },
          });
        }
      });

      socket.on("close", () => {
        void finalizeConnection();
      });

      socket.on("error", () => {
        void finalizeConnection();
      });
    },
  };
}
