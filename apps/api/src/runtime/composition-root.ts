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
  ProcessRoomLifecycle,
  RoomControl,
  RequestSpeaker,
  RespondInvitation,
  ReconnectRoom,
  SetSelfMute,
  UnmuteParticipant,
  SetHandRaised,
  SendReaction,
} from '@repo/application';
import {
  PostgresInvitationRepository,
  PostgresParticipantRepository,
  PostgresParticipantSessionRepository,
  PostgresRoomRepository,
  PostgresRoomSessionRepository,
  PostgresSpeakerRequestRepository,
  PostgresUserRepository,
  PostgresTransaction,
  createDatabase,
} from '@repo/db';
import { createRedisClient, RedisRaisedHandStore } from '@repo/redis-models';
import { randomUUID } from 'node:crypto';
import { loadConfig, type ApiConfig } from '../config.js';
import { MediaController } from '../media/media-controller.js';
import { RpcMediaService } from '../media/rpc-media-service.js';
import {
  DevelopmentQueryAuthenticator,
  JwtRealtimeAuthenticator,
} from '../realtime/authenticated-connection.js';
import { CommandRouter } from '../realtime/command-router.js';
import { ConnectionRegistry } from '../realtime/connection-registry.js';
import { JoinRoomRealtimeCommand } from '../realtime/commands/join-room.js';
import { LeaveRoomRealtimeCommand } from '../realtime/commands/leave-room.js';
import { EndRoomRealtimeCommand } from '../realtime/commands/end-room.js';
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
import {
  SendReactionRealtimeCommand,
  SetHandRaisedRealtimeCommand,
} from '../realtime/commands/room-interactions.js';
import { RedisRealtimeEventFanout } from '../realtime/event-fanout.js';
import { RedisRealtimeEventSequence } from '../realtime/event-sequence.js';
import { createRealtimeRuntime, type RealtimeRuntime } from '../realtime/ws-runtime.js';
import { RedisEventPublisher } from './event-publisher.js';
import { ApiRoomLifecycleRuntime, type RoomLifecycleRuntime } from './room-lifecycle.js';
import { RuntimeMetrics } from '../observability/runtime-metrics.js';
import { StructuredLogger } from '../observability/structured-logger.js';
import { AuthService } from '../auth/auth-service.js';
import { JwtService } from '../auth/jwt.js';
import { RedisRateLimiter } from '../security/rate-limiter.js';
import { RealtimeRateLimitPolicy } from '../security/realtime-rate-limit-policy.js';
import { InstrumentedTransaction } from './instrumented-transaction.js';

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
  readonly lifecycle: RoomLifecycleRuntime;
  readonly metrics: RuntimeMetrics;
  readonly auth: AuthService;
  readonly rateLimiter: RedisRateLimiter;
  readonly logger: StructuredLogger;
  readonly roomControl: RoomControl;
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
  const metrics = new RuntimeMetrics();
  const logger = new StructuredLogger();
  const rateLimiter = new RedisRateLimiter(redis, 'asr:v1:rate-limit', metrics, logger);
  const users = new PostgresUserRepository(database.db);
  const jwt = new JwtService(config.jwtSecret, config.jwtIssuer, config.jwtTtlSeconds);
  const auth = new AuthService(users, jwt);
  const rooms = new PostgresRoomRepository(database.db);
  const roomSessions = new PostgresRoomSessionRepository(database.db);
  const participants = new PostgresParticipantRepository(database.db);
  const participantSessions = new PostgresParticipantSessionRepository(database.db);
  const requests = new PostgresSpeakerRequestRepository(database.db);
  const invitations = new PostgresInvitationRepository(database.db);
  const transaction = new InstrumentedTransaction(
    new PostgresTransaction(database.db),
    metrics,
    logger
  );
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const events = new RedisEventPublisher(redis, metrics, logger);
  const eventSequence = new RedisRealtimeEventSequence(redis);
  const registry = new ConnectionRegistry();
  const raisedHands = new RedisRaisedHandStore(redis);
  const createRoom = new CreateRoom(transaction, ids, clock);
  const endRoom = new EndRoom(transaction, clock, events);
  const roomControl = new RoomControl(rooms, createRoom, endRoom);
  const snapshot = new GetRoomSnapshot(rooms, roomSessions, participants, raisedHands);
  const delegateHost = new DelegateHost(participants, clock, events);
  const join = new JoinRoom(transaction, ids, clock, events);
  const leave = new LeaveRoom(transaction, clock, events, delegateHost);
  const disconnect = new DisconnectRoom(transaction, clock, events, delegateHost);
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
  const setHandRaised = new SetHandRaised(participants, raisedHands, clock, events);
  const sendReaction = new SendReaction(participants, clock, events);
  const media = new RpcMediaService({
    baseUrl: config.mediaBaseUrl,
    authSecret: config.mediaRpcSecret,
    metrics,
    logger,
  });
  const mediaController = new MediaController(
    media,
    events,
    () => clock.now(),
    participants,
    participantSessions
  );
  const mute = new MuteParticipant(
    participants,
    roomSessions,
    participantSessions,
    clock,
    events,
    mediaController
  );
  const unmute = new UnmuteParticipant(participants, roomSessions, clock, events);
  const selfMute = new SetSelfMute(
    participants,
    clock,
    events,
    participantSessions,
    mediaController
  );
  const demote = new DemoteSpeaker(
    participants,
    clock,
    events,
    participantSessions,
    mediaController
  );
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
  const reconnect = new ReconnectRoom(transaction, clock, events);
  const lifecycle = new ApiRoomLifecycleRuntime(
    new ProcessRoomLifecycle(
      roomSessions,
      participants,
      participantSessions,
      endRoom,
      clock,
      events
    ),
    registry,
    mediaController,
    config.roomLifecycleIntervalMs
  );
  const rateLimitPolicy = new RealtimeRateLimitPolicy(config.rateLimits);
  const router = new CommandRouter({
    rateLimiter,
    rateLimitPolicy,
    maxRateLimitViolations: config.rateLimits.maxViolations,
    rateLimitViolationWindowMs: config.rateLimits.violationWindowMs,
  });
  router.register(new JoinRoomRealtimeCommand(join, snapshot, eventSequence));
  router.register(new LeaveRoomRealtimeCommand(leave, mediaController));
  router.register(new EndRoomRealtimeCommand(roomControl));
  router.register(new ReconnectRoomRealtimeCommand(reconnect, snapshot, eventSequence));
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
  router.register(new SetHandRaisedRealtimeCommand(setHandRaised));
  router.register(new SendReactionRealtimeCommand(sendReaction));
  const fanout = new RedisRealtimeEventFanout(redis, registry, (roomId, reason) =>
    lifecycle.terminateRoom(roomId, reason)
  );
  await fanout.start();
  const authenticator =
    config.authMode === 'development'
      ? new DevelopmentQueryAuthenticator(users, jwt)
      : new JwtRealtimeAuthenticator(users, jwt);
  const realtime = createRealtimeRuntime(
    router,
    registry,
    authenticator,
    disconnect,
    mediaController,
    config.participantDisconnectRecoveryMs,
    metrics,
    logger,
    config.realtimeMaxMessageBytes,
    config.realtimeMaxProtocolViolations,
    rateLimiter
  );
  lifecycle.start();
  return {
    config,
    realtime,
    registry,
    database,
    redis,
    lifecycle,
    metrics,
    auth,
    rateLimiter,
    logger,
    roomControl,
    close: async () => {
      lifecycle.stop();
      await fanout.close();
      await redis.quit();
      await database.client.end();
    },
  };
}
