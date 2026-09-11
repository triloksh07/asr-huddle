import {
  CreateRoom,
  DisconnectRoom,
  EndRoom,
  GetRoomSnapshot,
  JoinRoom,
  LeaveRoom,
  RequestSpeaker,
  CancelSpeakerRequest,
  ApproveSpeakerRequest,
  DenySpeakerRequest,
  InviteSpeaker,
  RespondInvitation,
  DemoteSpeaker,
} from '@repo/application';
import {
  PostgresParticipantRepository,
  PostgresParticipantSessionRepository,
  PostgresRoomRepository,
  PostgresRoomSessionRepository,
  PostgresUserRepository,
  PostgresSpeakerRequestRepository,
  PostgresInvitationRepository,
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
import {
  RequestSpeakerRealtimeCommand,
  CancelSpeakerRequestRealtimeCommand,
  ApproveSpeakerRequestRealtimeCommand,
  DenySpeakerRequestRealtimeCommand,
  InviteSpeakerRealtimeCommand,
  RespondInvitationRealtimeCommand,
  DemoteSpeakerRealtimeCommand,
} from '../realtime/commands/speaker-workflow.js';
class SystemClock {
  now() {
    return new Date();
  }
}
class UuidGenerator {
  next() {
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
  const u = new URL(config.redisUrl);
  const redis = createRedisClient({
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
  });
  await redis.connect();
  const users = new PostgresUserRepository(database.db),
    rooms = new PostgresRoomRepository(database.db),
    roomSessions = new PostgresRoomSessionRepository(database.db),
    participants = new PostgresParticipantRepository(database.db),
    participantSessions = new PostgresParticipantSessionRepository(database.db),
    requests = new PostgresSpeakerRequestRepository(database.db),
    invitations = new PostgresInvitationRepository(database.db),
    ids = new UuidGenerator(),
    clock = new SystemClock(),
    events = new RedisEventPublisher(redis);
  const createRoom = new CreateRoom(rooms, roomSessions, ids, clock);
  const endRoom = new EndRoom(rooms, roomSessions, clock, events);
  const snapshot = new GetRoomSnapshot(rooms, roomSessions, participants);
  const join = new JoinRoom(
    users,
    rooms,
    roomSessions,
    participants,
    participantSessions,
    ids,
    clock,
    events
  );
  const leave = new LeaveRoom(participants, participantSessions, clock, events);
  const disconnect = new DisconnectRoom(participants, participantSessions, clock, events);
  const requestSpeaker = new RequestSpeaker(
    participants,
    roomSessions,
    requests,
    ids,
    clock,
    events
  );
  const cancelRequest = new CancelSpeakerRequest(requests, clock, events);
  const approve = new ApproveSpeakerRequest(requests, participants, roomSessions, clock, events);
  const deny = new DenySpeakerRequest(requests, participants, clock, events);
  const invite = new InviteSpeaker(invitations, participants, ids, clock, events);
  const respondInvite = new RespondInvitation(invitations, participants, clock, events);
  const demote = new DemoteSpeaker(participants, clock, events);
  const media = new RpcMediaService({ baseUrl: config.mediaBaseUrl });
  const mediaController = new MediaController(media, events, () => clock.now(), participants);
  const router = new CommandRouter();
  router.register(new JoinRoomRealtimeCommand(join, snapshot));
  router.register(new LeaveRoomRealtimeCommand(leave));
  router.register(new CreateMediaTransportCommand(mediaController));
  router.register(new ConnectMediaTransportCommand(mediaController));
  router.register(new ProduceAudioCommand(mediaController));
  router.register(new ListAudioProducersCommand(mediaController));
  router.register(new ConsumeAudioCommand(mediaController));
  router.register(new RequestSpeakerRealtimeCommand(requestSpeaker));
  router.register(new CancelSpeakerRequestRealtimeCommand(cancelRequest));
  router.register(new ApproveSpeakerRequestRealtimeCommand(approve));
  router.register(new DenySpeakerRequestRealtimeCommand(deny));
  router.register(new InviteSpeakerRealtimeCommand(invite));
  router.register(new RespondInvitationRealtimeCommand(respondInvite));
  router.register(new DemoteSpeakerRealtimeCommand(demote));
  const registry = new ConnectionRegistry();
  const fanout = new RedisRealtimeEventFanout(redis, registry);
  await fanout.start();
  const authenticator =
    config.authMode === 'development'
      ? new DevelopmentQueryAuthenticator(users)
      : new RejectingRealtimeAuthenticator();
  const realtime = createRealtimeRuntime(
    router,
    registry,
    authenticator,
    disconnect,
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
      await fanout.close();
      await redis.quit();
      await database.client.end();
    },
  };
}
