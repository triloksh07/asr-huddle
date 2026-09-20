# ASR Huddle — Architecture

**Document status:** Repository-grounded architecture  
**Reviewed:** 2026-09-20  
**Repository:** [triloksh07/asr-huddle](https://github.com/triloksh07/asr-huddle)  
**Repository revision reviewed:** [6be03a4a4f093d0888e5680a976a24877f96308f](https://github.com/triloksh07/asr-huddle/commit/6be03a4a4f093d0888e5680a976a24877f96308f)

## 1. Purpose

This document describes the ASR Huddle V1 architecture as implemented at the reviewed repository revision, cross-checked against the accumulated PRD, V1 scope, implementation maps, Bug Report 01, and Test-7 progress records.

It distinguishes implemented structure from runtime-proven behavior and from remaining validation/correction work.

## 2. High-level architecture

```text
                         Browser / Web Client
                                  |
                    HTTP + WebSocket + WebRTC
                                  |
                                  v
                    +-------------------------+
                    |       API Runtime       |
                    |                         |
                    | HTTP endpoints          |
                    | Realtime runtime        |
                    | Authentication          |
                    | Command routing         |
                    | Application use cases   |
                    | Media authorization     |
                    | Lifecycle runtime       |
                    +------------+------------+
                                 |
                +----------------+----------------+
                |                                 |
                v                                 v
       +----------------+                 +---------------+
       |   PostgreSQL   |                 |    Redis      |
       | durable state  |                 | event fanout  |
       | users/rooms/   |                 | sequencing    |
       | participants/  |                 | rate limits   |
       | sessions/etc.  |                 | raised hands  |
       +----------------+                 +---------------+
                                 |
                                 | Media RPC
                                 v
                       +-----------------------+
                       |      SFU Runtime      |
                       | HTTP media RPC        |
                       | mediasoup worker      |
                       | routers/transports    |
                       | producers/consumers   |
                       +-----------+-----------+
                                   |
                                   v
                              WebRTC media
```

Core ownership:

- **PostgreSQL:** durable application state.
- **Redis:** live coordination/fanout, event sequencing, raised hands, rate limiting.
- **API:** authentication, business behavior, lifecycle, authorization and realtime protocol.
- **Media boundary:** translates authorized media operations into SFU calls.
- **SFU:** actual media transport/resource ownership.
- **Browser:** presentation, WebSocket client and WebRTC endpoint.

## 3. API composition

The active API entry point is `apps/api/src/index.ts`. It creates the runtime through `apps/api/src/runtime/composition-root.ts`.

The composition is effectively:

```text
Config
  ↓
PostgreSQL + repositories
  ↓
Application use cases
  ↓
Redis + event publisher/fanout
  ↓
Authentication
  ↓
MediaController + RpcMediaService
  ↓
CommandRouter
  ↓
RealtimeRuntime
  ↓
Room lifecycle runtime
  ↓
HTTP + WebSocket server
```

This is the current authoritative API composition path.

## 4. HTTP and authentication

The API uses Express. Current HTTP surface:

```text
GET  /health
GET  /metrics
POST /v1/auth/register
POST /v1/auth/login
POST /v1/rooms
GET  /v1/rooms
GET  /v1/rooms/:roomId
POST /v1/rooms/:roomId/end
WS   /v1/ws
```

HTTP authentication uses bearer JWTs. Registration/login use `AuthService`, the user repository and `JwtService`.

Realtime authentication occurs before a realtime connection is created. Development and production authentication paths are selected by configuration.

## 5. Realtime architecture

The active realtime implementation lives under `apps/api/src/realtime/`:

```text
WebSocket
   ↓
authentication
   ↓
RealtimeRuntime
   ↓
RealtimeSession
   ↓
CommandRouter
   ↓
command handler
   ↓
Application or MediaController
   ↓
response / event
```

The active command envelope is:

```json
{"requestId":"...","type":"command.name","payload":{}}
```

Responses contain `requestId`, `type`, `ok` and either `payload` or an error. Events contain `eventId`, `sequence`, `type`, `occurredAt`, `roomId` and `payload`.

The active command families include room lifecycle, media transport/audio, speaker workflow, moderation, hand/reaction interactions and reconnect.

`CommandRouter` owns protocol concerns such as command lookup, request handling, rate limiting, protocol violations and error normalization; it does not become the business-state owner.

## 6. Connection, participant and participant-session model

These are separate identities:

```text
User
  |
  +-- Participant = durable room participation
          |
          +-- ParticipantSession = connection/recovery instance
                    |
                    +-- connectionId = current realtime connection
```

A realtime connection begins authenticated but unbound. After `room.join`, it is bound to:

```text
roomId
roomSessionId
participantId
participantSessionId
```

The connection cannot be rebound to another room/session during its lifetime.

Participant state includes:

```text
managementRole: HOST | CO_HOST | NONE
audioRole:      SPEAKER | LISTENER
status:         CONNECTED | DISCONNECTED | LEFT | REMOVED
selfMuted
moderatorMuted
joined/disconnected/left/removed timestamps
```

Participant-session state includes its own lifecycle:

```text
ACTIVE | DISCONNECTED | CLOSED
connectionId
connectedAt
disconnectedAt
intentionalLeave
recoverableUntil
closedAt
```

This is what lets the system distinguish intentional leave, temporary disconnect and moderator removal.

## 7. Domain and application layers

`packages/domain` contains room, participant, speaker-request, invitation, reaction and policy concepts.

`packages/application` contains use cases for:

```text
Room:        create/end/lifecycle/snapshot/control
Participant: join/leave/disconnect/reconnect/demote/hand
Speaker:     request/cancel/approve/deny
Invitation:  invite/respond
Moderation:  delegate/promote/demote/mute/unmute/self-mute/remove
Reaction:    send
```

The conceptual dependency direction is:

```text
HTTP / Realtime / Media boundary
            ↓
       Application
            ↓
          Domain
            ↓
 repository/service ports
```

Business decisions therefore do not belong in the WebSocket transport itself.

## 8. PostgreSQL

`packages/db` is the durable persistence boundary.

Core tables are:

```text
users
rooms
room_sessions
participants
participant_sessions
speaker_requests
invitations
```

Important database invariants include:

- unique user email;
- one active room session per room;
- one connected user per room session;
- one globally connected participation per user;
- one active host per room session;
- one active participant session per participant;
- unique participant-session connection binding;
- one pending speaker request per participant;
- one pending invitation per target participant.

A transaction abstraction creates transaction-scoped repository adapters through `PostgresTransaction`.

## 9. Redis

The active Redis integration is `packages/redis-models`.

Current active responsibilities are intentionally narrow:

```text
realtime event publication
realtime event sequencing
realtime event fanout
raised-hand state
rate limiting
```

The active event path is:

```text
Application event
      ↓
RedisEventPublisher
      ↓
Redis Pub/Sub
      ↓
RedisRealtimeEventFanout
      ↓
ConnectionRegistry
      ↓
room connections
```

Redis is not the durable source of truth for room membership, participant role or lifecycle.

## 10. Media architecture

The active API media path is:

```text
Realtime command
      ↓
MediaController
      ↓
MediaService abstraction
      ↓
RpcMediaService
      ↓
HTTP /rpc/media
      ↓
SFU runtime
      ↓
mediasoup
      ↓
WebRTC
```

The active media contract is `packages/media-contract`.

Media operations carry the full identity context:

```text
roomId
roomSessionId
participantId
participantSessionId
connectionId
```

The API re-checks participant state before allowing audio transmission. The effective authorization rule is:

```text
CONNECTED
+ SPEAKER
+ not self-muted
+ not moderator-muted
= can transmit audio
```

A client cannot grant itself speaker transmission permission.

## 11. SFU

`apps/sfu-node` is the active mediasoup runtime.

Its runtime is:

```text
SFU process
   ↓
Redis
   ↓
mediasoup worker
   ↓
MediasoupMediaService
   ↓
SFU HTTP server
   ↓
/rpc/media
```

The SFU owns actual media resources:

```text
routers
transports
producers
consumers
audio observers
```

It does not own product-level room roles or participant authorization.

## 12. API ↔ SFU media RPC

The API and SFU are separate processes. The RPC boundary is authenticated using the media RPC secret.

Request shape:

```text
requestId
method
params
```

Response shape:

```text
requestId
ok
result
```

or:

```text
requestId
ok=false
error
```

The API validates and correlates the response and applies timeout/error normalization. API and SFU both expose structured media-operation logging and dependency metrics.

This boundary is substantially implemented; remaining work is primarily resource-level validation and reconciliation rather than replacing the boundary.

## 13. Room lifecycle

`apps/api/src/runtime/room-lifecycle.ts` periodically invokes the application lifecycle processor.

```text
Lifecycle scheduler
       ↓
ProcessRoomLifecycle
       ↓
room/session/participant state
       ↓
expiry/end/participant cleanup
       ↓
events + realtime effects
```

Room sessions contain start, expiry, warning, status and end information.

A closed WebSocket does not itself mean the room ended.

## 14. Host/co-host architecture

The model intentionally separates `HOST` and `CO_HOST`.

There is no automatic permanent host-transfer model.

The current recovery/delegation model is:

```text
HOST disconnects
      ↓
HOST remains recoverable
      ↓
existing CO_HOST remains CO_HOST
      OR
eligible participant can be delegated if no CO_HOST exists
      ↓
HOST reconnects
      ↓
original HOST role is restored
      ↓
existing/delegated CO_HOST remains CO_HOST
```

This behavior has terminal evidence in the accumulated Test-7 record.

The remaining architectural correctness issue is concurrent host-loss/delegation: the selection/check/update sequence still needs a concurrency-safe invariant.

## 15. Speaker, listener and moderation model

Management role and audio role are independent:

```text
managementRole != audioRole
```

A raised hand is also distinct from becoming a speaker.

The speaker workflow is:

```text
LISTENER
   ↓
speaker.request
   ↓
moderator decision
   ↓
approve / deny
   ↓
SPEAKER transition
   ↓
media authorization
```

Mute/demotion operations must reconcile both logical participant state and actual media resources.

The current implementation contains the relevant media RPC paths, but the accumulated Test-7 status deliberately distinguishes logical/RPC evidence from actual producer-level evidence.

## 16. Disconnect and reconnect

Temporary disconnect:

```text
connection closes
      ↓
participant session becomes recoverable
      ↓
participant remains logically present
      ↓
media cleanup
      ↓
new connection/session identity
      ↓
reconnect restores participant state
```

Intentional leave:

```text
room.leave
   ↓
participant leaves
   ↓
session closes/releases
   ↓
media cleanup
   ↓
future participation is possible
```

Moderator removal is a separate terminal participant state.

## 17. Media recovery

The intended recovery model is:

```text
old connection
      ↓
old media identity invalidated/cleaned
      ↓
new connection
      ↓
new participant-session identity
      ↓
receive media reconciliation
      ↓
send media restored only if currently authorized
```

Reconnect itself must never grant transmission permission.

The recovery implementation exists in the current development path, while complete producer/resource-level recovery remains a Group-5 validation item.

## 18. Browser runtime

`apps/web` is currently a Vite-based runtime harness, not the final production Next.js UI.

It contains the browser audio client and exercises:

```text
auth
room create/join/leave
WebSocket
mediasoup-client
microphone capture
send/receive transports
produce/consume
speaker workflow
audio state
basic WebRTC quality measurements
```

The production Next.js UI remains a later stage.

## 19. Infrastructure topology

The active root `docker-compose.yml` provides:

```text
PostgreSQL 16 :5432
Redis 7      :6379
```

with persistent volumes and health checks.

API, SFU and web are currently run as local Node applications rather than Compose services:

```text
Docker Compose
  ├── PostgreSQL
  └── Redis

Local processes
  ├── API
  ├── SFU
  └── Web
```

## 20. Active vs legacy architecture

The repository contains older/parallel components. Their existence must not be confused with active runtime ownership.

Relevant legacy/parallel packages include:

```text
packages/protocol
packages/sfu-contract
packages/state-machine
packages/redis
packages/api-contract
```

Current active replacements/boundaries are:

```text
Realtime protocol → apps/api/src/realtime
Media contract    → packages/media-contract
Redis runtime     → packages/redis-models
API composition   → apps/api/src/runtime/composition-root.ts
```

`packages/api-contract` is relevant to the later tRPC/API-contract stage, not the current realtime runtime.

## 21. Current architectural status — 2026-09-20

### Established

```text
[✓] API composition root
[✓] PostgreSQL durable state
[✓] Redis event/fanout infrastructure
[✓] authentication
[✓] realtime connection model
[✓] command routing
[✓] room/participant/session model
[✓] media authorization boundary
[✓] API → SFU media RPC
[✓] mediasoup SFU runtime
[✓] room lifecycle runtime
[✓] structured logging/metrics infrastructure
[✓] disconnect/reconnect architecture
[✓] host/co-host recovery model
```

### Implemented but still requiring focused runtime/resource validation

```text
[ ] actual producer revocation after self-mute
[ ] actual producer revocation after moderator mute
[ ] actual producer revocation after speaker demotion
[ ] complete media reconciliation after reconnect
[ ] muted-speaker reconnect authorization
[ ] concurrent host delegation invariant
```

### Later validation

```text
[ ] real browser microphone/WebRTC audio
[ ] browser-to-browser audio
[ ] simultaneous speakers
[ ] failure injection
[ ] SFU/API/Redis restart behavior
[ ] capacity validation
[ ] production Next.js UI
```

Current project sequence:

```text
remaining Bug Report 01 work
        ↓
focused terminal regression
        ↓
tRPC / API-contract layer
        ↓
production Next.js UI
        ↓
browser/WebRTC/audio validation
        ↓
failure + capacity hardening
```

## 22. Architectural invariants

### Durable state

```text
PostgreSQL = durable application truth
```

### Identity separation

```text
connectionId != participantId != participantSessionId
```

### Audio authorization

```text
SPEAKER + CONNECTED + not muted
    => eligible to transmit
```

### Role separation

```text
management role != audio role
```

### Recovery distinction

```text
temporary disconnect != intentional leave
```

### Media identity

```text
room
+ room session
+ participant
+ participant session
+ connection
```

must remain aligned when media is authorized or cleaned up.

### SFU ownership

```text
SFU = media transport/resource owner
```

It is not the product-state authority.

## 23. Architecture vs validation

For this project, these are separate claims:

```text
Architecture
    = how responsibilities are divided.

Implementation
    = whether those boundaries exist in code.

Runtime validation
    = whether those boundaries work together.

Browser/audio validation
    = whether the user-visible media path works.
```

The Test-6/Test-7 records explicitly maintain this distinction. Therefore application/RPC evidence must not be presented as proof of actual WebRTC audio behavior.

## 24. Conclusion

The repository now has one recognizable active architecture:

```text
Browser
   ↓
HTTP / WebSocket
   ↓
API Runtime
   ├── Authentication
   ├── Realtime protocol
   ├── Command routing
   ├── Application
   ├── Domain
   ├── PostgreSQL
   ├── Redis
   └── Media authorization
          ↓
       Media RPC
          ↓
         SFU
          ↓
       mediasoup
          ↓
        WebRTC
```

The remaining work is primarily correctness and proof across boundaries.

The main remaining architectural correctness areas are media-resource reconciliation, reconnect/media recovery, concurrency-safe host delegation, focused terminal regression, and later browser/WebRTC validation.
