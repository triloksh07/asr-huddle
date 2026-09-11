import {
  CreateRoom,
  DisconnectRoom,
  EndRoom,
  GetRoomSnapshot,
  JoinRoom,
  LeaveRoom,
} from '@repo/application';
import {
  PostgresParticipantRepository,
  PostgresParticipantSessionRepository,
  PostgresRoomRepository,
  PostgresRoomSessionRepository,
  PostgresUserRepository,
  createDatabase,
} from '@repo/db';
import { createRedisClient } from '@repo/redis-models';
import { RpcMediaService } from '../media/rpc-media-service.js';
import { MediaController } from '../media/media-controller.js';
import { randomUUID } from 'node:crypto';
import { loadConfig, type ApiConfig } from '../config.js';
import {
  DevelopmentQueryAuthenticator,
  RejectingRealtimeAuthenticator,
} from '../realtime/authenticated-connection.js';
import { CommandRouter } from '../realtime/command-router.js';
import { ConnectionRegistry } from '../realtime/connection-registry.js';
import { JoinRoomRealtimeCommand } from '../realtime/commands/join-room.js';
import { LeaveRoomRealtimeCommand } from '../realtime/commands/leave-room.js';
import {
  ConsumeAudioCommand,
  ConnectMediaTransportCommand,
  CreateMediaTransportCommand,
  ListAudioProducersCommand,
  ProduceAudioCommand,
} from '../realtime/commands/media.js';
import { RedisRealtimeEventFanout } from '../realtime/event-fanout.js';
import { createRealtimeRuntime, type RealtimeRuntime } from '../realtime/ws-runtime.js';
import { RedisEventPublisher } from './event-publisher.js';

class SystemClock {
  now(): Date {
    return new Date();
  }
}
class UuidGenerator {
  next(): string {
    return randomUUID();
  }
}

export interface ApiRuntime {
  readonly config: ApiConfig;
  readonly realtime: RealtimeRuntime;
  readonly registry: ConnectionRegistry;
  readonly database: ReturnType<typeof createDatabase>;
  readonly redis: ReturnType<typeof createRedisClient>;
  readonly close: () => Promise<void>;
}

export async function createApiRuntime(config: ApiConfig = loadConfig()): Promise<ApiRuntime> {
  const database = createDatabase(config.databaseUrl);
  const redisUrl = new URL(config.redisUrl);
  const redis = createRedisClient({
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    password: redisUrl.password || undefined,
  });
  await redis.connect();

  const users = new PostgresUserRepository(database.db);
  const rooms = new PostgresRoomRepository(database.db);
  const roomSessions = new PostgresRoomSessionRepository(database.db);
  const participants = new PostgresParticipantRepository(database.db);
  const participantSessions = new PostgresParticipantSessionRepository(database.db);
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const events = new RedisEventPublisher(redis);

  const createRoom = new CreateRoom(rooms, roomSessions, ids, clock);
  const endRoom = new EndRoom(rooms, roomSessions, clock, events);
  const getRoomSnapshot = new GetRoomSnapshot(rooms, roomSessions, participants);
  const joinRoom = new JoinRoom(
    users,
    rooms,
    roomSessions,
    participants,
    participantSessions,
    ids,
    clock,
    events
  );
  const leaveRoom = new LeaveRoom(participants, participantSessions, clock, events);
  const disconnectRoom = new DisconnectRoom(participants, participantSessions, clock, events);

  const media = new RpcMediaService({ baseUrl: config.mediaBaseUrl });
  const mediaController = new MediaController(media);

  const router = new CommandRouter();
  router.register(new JoinRoomRealtimeCommand(joinRoom, getRoomSnapshot));
  router.register(new LeaveRoomRealtimeCommand(leaveRoom));
  router.register(new CreateMediaTransportCommand(mediaController));
  router.register(new ConnectMediaTransportCommand(mediaController));
  router.register(new ProduceAudioCommand(mediaController));
  router.register(new ListAudioProducersCommand(mediaController));
  router.register(new ConsumeAudioCommand(mediaController));

  const registry = new ConnectionRegistry();
  const eventFanout = new RedisRealtimeEventFanout(redis, registry);
  await eventFanout.start();

  const authenticator =
    config.authMode === 'development'
      ? new DevelopmentQueryAuthenticator(users)
      : new RejectingRealtimeAuthenticator();

  const realtime = createRealtimeRuntime(
    router,
    registry,
    authenticator,
    disconnectRoom,
    mediaController,
    config.participantDisconnectRecoveryMs
  );

  return {
    config,
    realtime,
    registry,
    database,
    redis,
    close: async () => {
      await eventFanout.close();
      await redis.quit();
      await database.client.end();
    },
  };
}
