import { CommandRouter } from "../realtime/command-router.js";
import { ConnectionRegistry } from "../realtime/connection-registry.js";
import {
  RejectingRealtimeAuthenticator,
  createRealtimeRuntime,
} from "../realtime/index.js";

export interface ApiRuntime {
  realtime: ReturnType<typeof createRealtimeRuntime>;
  connections: ConnectionRegistry;
}

export function createApiRuntime(): ApiRuntime {
  const connections = new ConnectionRegistry();
  const router = new CommandRouter();

  // Application use-case handlers are wired here once the concrete
  // repositories and services are composed by the API process.
  return {
    connections,
    realtime: createRealtimeRuntime(
      router,
      connections,
      new RejectingRealtimeAuthenticator(),
    ),
  };
}
