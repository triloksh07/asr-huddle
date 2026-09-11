import type { MediaService } from '@repo/media-contract';
import type { DisconnectRoom } from '@repo/application';
import { CommandRouter } from '../realtime/command-router.js';
import { ConnectionRegistry } from '../realtime/connection-registry.js';
import { RejectingRealtimeAuthenticator, createRealtimeRuntime } from '../realtime/index.js';
import { MediaController } from '../media/media-controller.js';
import {
  ConnectMediaTransportCommand,
  ConsumeAudioCommand,
  CreateMediaTransportCommand,
  ListAudioProducersCommand,
  ProduceAudioCommand,
} from '../realtime/commands/media.js';

export interface ApiRuntimeDependencies {
  media: MediaService;
  disconnectRoom: DisconnectRoom;
  disconnectRecoveryMs?: number;
}

export interface ApiRuntime {
  realtime: ReturnType<typeof createRealtimeRuntime>;
  connections: ConnectionRegistry;
  router: CommandRouter;
}

export function createApiRuntime(dependencies: ApiRuntimeDependencies): ApiRuntime {
  const connections = new ConnectionRegistry();
  const router = new CommandRouter();
  const mediaController = new MediaController(dependencies.media);

  router.register(new CreateMediaTransportCommand(mediaController));
  router.register(new ConnectMediaTransportCommand(mediaController));
  router.register(new ProduceAudioCommand(mediaController));
  router.register(new ListAudioProducersCommand(mediaController));
  router.register(new ConsumeAudioCommand(mediaController));

  return {
    connections,
    router,
    realtime: createRealtimeRuntime(
      router,
      connections,
      new RejectingRealtimeAuthenticator(),
      dependencies.disconnectRoom,
      mediaController,
      dependencies.disconnectRecoveryMs ?? 15_000
    ),
  };
}
