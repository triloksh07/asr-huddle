import type { ConnectionId } from "@repo/domain";
import { randomUUID } from "node:crypto";
import { CommandRouter } from "./command-router.js";
import { ConnectionRegistry } from "./connection-registry.js";
import {
  createAuthenticatedConnection,
  type RealtimeAuthenticator,
} from "./authenticated-connection.js";
import { createRealtimeSession } from "./ws-session.js";
import type { RealtimeTransport } from "./types.js";

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
        registry.remove(connectionId);
      });

      socket.on("error", () => {
        registry.remove(connectionId);
      });
    },
  };
}
