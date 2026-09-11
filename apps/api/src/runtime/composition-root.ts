import {
  ApproveSpeakerRequest,
  CancelSpeakerRequest,
  CreateRoom,
  DemoteCoHost,
  DemoteSpeaker,
  DelegateHost,
  DenySpeakerRequest,
  DisconnectRoom,
  EndRoom,
  GetRoomSnapshot,
  InviteSpeaker,
  JoinRoom,
  LeaveRoom,
  MuteParticipant,
  PromoteCoHost,
  RemoveParticipant,
  RequestSpeaker,
  RespondInvitation,
  ReconnectRoom,
  SetSelfMute,
  UnmuteParticipant,
} from '@repo/application';
import {
  PostgresInvitationRepository,
  PostgresParticipantRepository,
  PostgresParticipantSessionRepository,
  PostgresRoomRepository,
  PostgresRoomSessionRepository,
  PostgresSpeakerRequestRepository,
  PostgresUserRepository,
  createDatabase,
} from '@repo/db';
import { createRedisClient } from '@repo/redis-models';
import { randomUUID } from 'node:crypto';
import { loadConfig, type ApiConfig } from '../config.js';
import { MediaController } from '../media/media-controller.js';
import { RpcMediaService } from '../media/rpc-media-service.js';
import {
  DevelopmentQueryAuthenticator,
  RejectingRealtimeAuthenticator,
} from '../realtime/authenticated-connection.js';
import { CommandRouter } from '../realtime/command-router.js';
import { ConnectionRegistry } from '../realtime/connection-registry.js';
import { JoinRoomRealtimeCommand } from '../realtime/commands/join-room.js';
import { LeaveRoomRealtimeCommand } from '../realtime/commands/leave-room.js';
import { ReconnectRoomRealtimeCommand } from '../realtime/commands/reconnect-room.js';
import {
  ConsumeAudioCommand,
  ConnectMediaTransportCommand,
  CreateMediaTransportCommand,
  ListAudioProducersCommand,
  ProduceAudioCommand,
} from '../realtime/commands/media.js';
import {
  DemoteCoHostRealtimeCommand,
  MuteParticipantRealtimeCommand,
  PromoteCoHostRealtimeCommand,
  RemoveParticipantRealtimeCommand,
  SetSelfMuteRealtimeCommand,
  UnmuteParticipantRealtimeCommand,
} from '../realtime/commands/realtime-moderation.js';
import {
  ApproveSpeakerRequestRealtimeCommand,
  CancelSpeakerRequestRealtimeCommand,
  DenySpeakerRequestRealtimeCommand,
  DemoteSpeakerRealtimeCommand,
  InviteSpeakerRealtimeCommand,
  RequestSpeakerRealtimeCommand,
  RespondInvitationRealtimeCommand,
} from '../realtime/commands/speaker-workflow.js';
import { RedisRealtimeEventFanout } from '../realtime/event-fanout.js';
import { createRealtimeRuntime, type RealtimeRuntime } from '../realtime/ws-runtime.js';
import { RedisEventPublisher } from './event-publisher.js';

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

  const users = new PostgresUserRepository(database.db);
  const rooms = new PostgresRoomRepository(database.db);
  const roomSessions = new PostgresRoomSessionRepository(database.db);
  const participants = new PostgresParticipantRepository(database.db);
  const participantSessions = new PostgresParticipantSessionRepository(database.db);
  const requests = new PostgresSpeakerRequestRepository(database.db);
  const invitations = new PostgresInvitationRepository(database.db);
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const events = new RedisEventPublisher(redis);
  const registry = new ConnectionRegistry();

  const createRoom = new CreateRoom(rooms, roomSessions, ids, clock);
  const endRoom = new EndRoom(rooms, roomSessions, clock, events);
  const snapshot = new GetRoomSnapshot(rooms, roomSessions, participants);

  const delegateHost = new DelegateHost(participants, clock, events);

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
  const leave = new LeaveRoom(participants, participantSessions, clock, events, delegateHost);
  const disconnect = new DisconnectRoom(
    participants,
    participantSessions,
    clock,
    events,
    delegateHost
  );

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

  const mute = new MuteParticipant(
    participants,
    roomSessions,
    participantSessions,
    clock,
    events,
    mediaController
  );
  const unmute = new UnmuteParticipant(participants, roomSessions, clock, events);
  const selfMute = new SetSelfMute(participants, clock, events);
  const promoteCoHost = new PromoteCoHost(participants, roomSessions, clock, events);
  const demoteCoHost = new DemoteCoHost(participants, clock, events);
  const removeParticipant = new RemoveParticipant(
    participants,
    participantSessions,
    requests,
    invitations,
    clock,
    events,
    {
      closeConnection: (participantId: Parameters<typeof registry.closeParticipant>[0]) =>
        registry.closeParticipant(participantId),
      closeMedia: context =>
        mediaController.closeParticipant(
          context as unknown as Parameters<typeof mediaController.closeParticipant>[0]
        ),
    }
  );

  const reconnect = new ReconnectRoom(
    users,
    rooms,
    roomSessions,
    participants,
    participantSessions,
    clock,
    events
  );

  const router = new CommandRouter();

  router.register(new JoinRoomRealtimeCommand(join, snapshot));
  router.register(new LeaveRoomRealtimeCommand(leave));
  router.register(new ReconnectRoomRealtimeCommand(reconnect, snapshot));

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

  router.register(new MuteParticipantRealtimeCommand(mute));
  router.register(new UnmuteParticipantRealtimeCommand(unmute));
  router.register(new SetSelfMuteRealtimeCommand(selfMute));
  router.register(new PromoteCoHostRealtimeCommand(promoteCoHost));
  router.register(new DemoteCoHostRealtimeCommand(demoteCoHost));
  router.register(new RemoveParticipantRealtimeCommand(removeParticipant));

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
