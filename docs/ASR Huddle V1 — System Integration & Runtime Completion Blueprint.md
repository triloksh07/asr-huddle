# ASR Huddle V1 — System Integration & Runtime Completion Blueprint

**Status:** Implementation planning  
**Purpose:** Connect the existing repository pieces into one coherent V1 runtime and define exactly what must be completed, replaced, or wired together.  
**Basis:** Current repository implementation + ASR Huddle PRD + V1 Scope Document  
**Primary concern:** Actual runtime integration, not theoretical architecture.

---

# 1. Executive Summary

ASR Huddle already contains many of the required building blocks:

- domain models for rooms and participants;
- room/session lifecycle concepts;
- role and capacity policies;
- application use cases;
- repository ports;
- PostgreSQL persistence;
- Redis infrastructure;
- a realtime command/router architecture;
- media abstractions;
- mediasoup-based infrastructure;
- connection/session abstractions;
- a participant state-machine implementation;
- an initial browser SFU client.

The problem is **not that the project has no architecture**.

The problem is that there are currently **multiple partially overlapping generations of the architecture**, and several important boundaries stop short of the next subsystem.

The current situation is approximately:

```text
                 ┌─────────────────────────┐
                 │       Browser/UI        │
                 └────────────┬────────────┘
                              │
                         protocol
                              │
                 ┌────────────▼────────────┐
                 │    Realtime Runtime     │
                 │  auth / session / router│
                 └────────────┬────────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
             Application               Media
             use cases                abstraction
                  │                       │
                  ▼                       ▼
              PostgreSQL               SFU/media
```

But the implementation currently has breaks between these layers.

The most important ones are:

1. **The active API bootstrap does not actually run the new realtime architecture.**
2. **Realtime authentication is still a rejecting placeholder.**
3. **`room.join` creates/loads application state but does not complete the connection binding flow.**
4. **The join flow does not currently establish the participant-session object required by the realtime/media layer.**
5. **Media commands exist, but the media implementation is not fully connected to the realtime runtime.**
6. **The old browser client uses a different protocol from the new realtime command system.**
7. **Disconnect/reconnect lifecycle is not completed across connection → participant session → participant → media.**
8. **Room lifecycle exists in domain/application code but its runtime scheduling/expiry integration is incomplete.**
9. **Speaker-request persistence/use cases are incomplete relative to V1.**
10. **Invitation/moderation flows are incomplete.**
11. **Redis exists as infrastructure but its authoritative runtime responsibilities need to be explicitly wired rather than leaving it as an unused dependency.**
12. **There are overlapping participant lifecycle/state-machine abstractions that need one clear ownership model.**
13. **The repository contains older and newer runtime generations simultaneously.**
14. **The actual audio pipeline therefore cannot currently be treated as an end-to-end V1 runtime.**

The goal of the next implementation phase is therefore **not to patch every old implementation**.

The goal is:

> **Build one coherent V1 runtime using the useful existing pieces, replacing obsolete pieces where necessary, and make every boundary executable and testable end-to-end.**

---

# 2. What V1 Actually Requires

The V1 system must support this complete product loop:

```text
Authenticate
     │
     ▼
Discover / Create Room
     │
     ▼
Establish Realtime Connection
     │
     ▼
Join Room
     │
     ├── create/recover participant session
     ├── establish participant state
     ├── bind connection
     └── return room snapshot
     │
     ▼
Create Media Session
     │
     ▼
WebRTC Transport
     │
     ▼
Speaker Produces Audio
     │
     ▼
SFU
     │
     ├───────────────┐
     ▼               ▼
Speaker A         Speaker B
     │               │
     └──────┬────────┘
            ▼
       Listeners
```

At the same time, room state must remain independent from the WebRTC connection:

```text
Room
 │
 ├── participants
 │      ├── roles
 │      ├── speaker/listener state
 │      └── lifecycle
 │
 ├── requests
 │
 └── room lifecycle
```

while realtime state is:

```text
Connection
 │
 └── Participant Session
       │
       ├── connection state
       ├── recovery information
       └── media identity
```

and media state is:

```text
Participant Session
        │
        ▼
Media Session
        │
        ├── transports
        ├── producers
        └── consumers
```

These are related, but they must **not become one giant state object**.

---

# 3. The Core Runtime Model

The final V1 architecture should have five major planes.

```text
                    ASR HUDDLE
                        │
       ┌────────────────┼────────────────┐
       │                │                │
       ▼                ▼                ▼
   Product/API       Realtime           Media
       │                │                │
       ▼                ▼                ▼
 Application       Connection        SFU/mediasoup
       │              lifecycle           │
       ▼                │                 │
 PostgreSQL             │                 │
       ▲                │                 │
       └──────── Redis / Events ──────────┘
```

More precisely:

```text
┌─────────────────────────────────────────────────────────┐
│                       CLIENT                            │
│                                                         │
│  UI / Room State / Audio / WebRTC                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ authenticated realtime protocol
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  REALTIME GATEWAY                        │
│                                                         │
│ Authentication                                          │
│ Connection Registry                                     │
│ Session                                                 │
│ Command Router                                          │
│ Connection Context                                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                     │
│                                                         │
│ Room Use Cases                                          │
│ Participant Use Cases                                   │
│ Speaker Request Use Cases                               │
│ Moderation Use Cases                                    │
│ Session/Recovery Use Cases                              │
└─────────────┬───────────────────────────┬───────────────┘
              │                           │
              ▼                           ▼
       ┌───────────────┐          ┌──────────────────┐
       │ PostgreSQL    │          │ Redis / Events   │
       │ durable state │          │ live coordination│
       └───────────────┘          └────────┬─────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │     MEDIA SERVICE      │
                              │                        │
                              │ Router                 │
                              │ Transport              │
                              │ Producer               │
                              │ Consumer               │
                              └───────────┬────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │       SFU / mediasoup  │
                              └────────────────────────┘
```

---

# 4. Source of Truth: What Belongs Where

One of the most important integration decisions is preventing the same state from being independently authoritative in multiple places.

## 4.1 PostgreSQL

PostgreSQL should own durable product state.

This includes:

```text
User
Room
Room Session
Participant
Participant Session
Speaker Request
Invitation
```

and their durable lifecycle information.

PostgreSQL answers questions such as:

> Who is this user?

> Does this room exist?

> Who is the host?

> Is this participant a speaker?

> Was this participant intentionally removed?

> What speaker requests exist?

> Which room session is active?

---

# 5. Redis

Redis should not become a second PostgreSQL.

Its role should be limited to **ephemeral/live coordination where that provides actual value**.

Appropriate responsibilities include:

```text
Realtime presence
Connection/session coordination
Short-lived recovery state
Pub/sub event fanout
Distributed coordination/locks where required
Ephemeral room runtime state
```

It should not be used as the permanent authority for:

```text
User identity
Permanent participant roles
Room history
Speaker-request history
Room ownership
```

The existing Redis package is infrastructure, but the V1 runtime needs explicit Redis responsibilities and adapters.

The important rule is:

> If removing Redis would destroy durable product state, that state is probably in the wrong place.

---

# 6. In-Memory State

The API process may keep process-local state for:

```text
Live WebSocket connections
Connection objects
Connection → participant binding
Connection-local transport/session references
SFU object references
```

But this state is not durable.

Therefore:

```text
In-memory state
      ≠
database state
```

and:

```text
process restart
      ↓
in-memory state disappears
      ↓
durable room state must remain valid
```

This is especially important when reconnecting after API/SFU failures.

---

# 7. SFU State

The SFU owns actual media transport state.

For example:

```text
Router
Transport
Producer
Consumer
WebRTC connection
RTP media flow
```

The application must not pretend PostgreSQL knows whether a WebRTC producer is currently alive.

Instead:

```text
Application
  │
  │ authorization / identity
  ▼
Media Service
  │
  ▼
SFU
  │
  ▼
actual media state
```

The application owns **whether the participant is allowed to publish**.

The SFU owns **whether the media is currently flowing**.

---

# 8. The Most Important Missing Connection: Participant Session

The current repository has a conceptual distinction between:

```text
Participant
```

and:

```text
Participant Session
```

This distinction is correct and required for V1.

A participant represents:

> the user's participation in the room.

A participant session represents:

> a particular active/recoverable connection/session of that participant.

The current application `JoinRoom` flow creates the participant but does not currently complete the participant-session lifecycle required by the realtime binding/media layer.

That creates a broken chain:

```text
JoinRoom
   ↓
Participant created
   ↓
???
   ↓
Realtime expects participantSessionId
```

The final chain must instead be:

```text
Authenticated User
       ↓
Join Room
       ↓
Validate room/access/capacity/session rules
       ↓
Create Participant
       ↓
Create Participant Session
       ↓
Persist both atomically
       ↓
Return:
  roomId
  participantId
  participantSessionId
  roles
  current state
       ↓
Bind realtime connection
```

This is one of the first integration corrections required.

---

# 9. Connection Binding

The repository already contains a binding concept.

The intended operation is effectively:

```text
Realtime Connection
       │
       ├── userId
       ├── roomId
       ├── participantId
       └── participantSessionId
```

The existing `bindJoinedRoomSession(...)` helper exists specifically to establish this relationship.

But the current `room.join` realtime command does not complete that binding.

Therefore the current flow is effectively:

```text
WS connection
    ↓
room.join
    ↓
JoinRoom use case
    ↓
success
    ↓
response
```

when it needs to become:

```text
WS connection
    ↓
room.join
    ↓
JoinRoom
    ↓
participant + participant session
    ↓
bind connection
    ↓
return room snapshot/session information
    ↓
client may proceed to media
```

This binding is the bridge between the application layer and realtime/media layer.

Without it, media commands cannot safely establish:

```text
roomId
participantId
participantSessionId
```

from trusted server-side connection state.

---

# 10. Authentication Must Sit Before Room Participation

The current realtime authenticator is still a rejecting placeholder.

Therefore the final runtime must establish:

```text
Client
  ↓
Realtime connection
  ↓
Authenticate connection
  ↓
Resolve user identity
  ↓
Create authenticated connection context
  ↓
Allow commands
```

not:

```text
Client
  ↓
anonymous WS
  ↓
room.join
```

The V1 requirement is server-authoritative authentication and authorization.

The browser cannot send:

```text
{
  role: "host"
}
```

and make itself host.

The server must derive authorization from:

```text
authenticated user
+
room membership
+
participant state
+
management role
+
audio role
```

---

# 11. Realtime Connection Context

The connection context should become the trusted realtime identity boundary.

Conceptually:

```text
ConnectionContext
{
    connectionId

    userId

    roomId?
    participantId?
    participantSessionId?

    authenticated
}
```

After authentication:

```text
userId != null
```

After successful room join:

```text
roomId != null
participantId != null
participantSessionId != null
```

After leaving:

```text
roomId = null
participantId = null
participantSessionId = null
```

The connection should not be able to arbitrarily mutate these fields.

They change through trusted server operations.

---

# 12. Complete Room Join Flow

The final V1 join flow should be:

```text
1. Client authenticates
        ↓
2. WebSocket connection established
        ↓
3. Realtime authenticator resolves user
        ↓
4. Connection context stores userId
        ↓
5. Client sends room.join
        ↓
6. Command router validates envelope
        ↓
7. JoinRoom use case executes
        ↓
8. Validate:
      - authenticated user
      - room exists
      - room active
      - room access
      - duplicate active session
      - capacity
        ↓
9. Create participant
        ↓
10. Create participant session
        ↓
11. Persist transactionally
        ↓
12. Publish room/participant event
        ↓
13. Bind connection
        ↓
14. Return room snapshot
        ↓
15. Client renders room
        ↓
16. Client initializes media flow
```

---

# 13. Room Snapshot

Joining should not require the client to reconstruct the room from dozens of individual events.

The server should return a coherent initial snapshot.

Conceptually:

```text
Room Snapshot
├── room
│   ├── id
│   ├── name
│   ├── description
│   ├── visibility
│   ├── status
│   └── remaining duration
│
├── current participant
│   ├── participantId
│   ├── sessionId
│   ├── managementRole
│   └── audioRole
│
├── participants[]
│   ├── identity
│   ├── management role
│   ├── audio role
│   ├── connection state
│   └── microphone state
│
└── pending speaker requests[]
```

After the snapshot, realtime events keep the client synchronized.

---

# 14. Event Flow After Join

Once a participant joins:

```text
Application state change
        ↓
Domain event
        ↓
Event publisher
        ↓
Redis / realtime fanout
        ↓
All affected room connections
        ↓
Client state update
```

For example:

```text
Participant joins
      ↓
participant.joined
      ↓
room subscribers
      ↓
participant appears in UI
```

Similarly:

```text
Speaker approved
      ↓
participant.role.changed
      ↓
room subscribers
      ↓
UI updates
```

The client should not repeatedly poll the database for realtime state.

---

# 15. Media Pipeline

The media path must be explicitly connected to the participant session.

The complete V1 audio pipeline is:

```text
Speaker Browser
     │
     │ microphone
     ▼
MediaStreamTrack
     │
     ▼
WebRTC Send Transport
     │
     │ DTLS/SRTP
     ▼
SFU Router
     │
     ▼
Producer
     │
     ├───────────────┐
     │               │
     ▼               ▼
Consumer A       Consumer B
     │               │
     ▼               ▼
Listener A       Listener B
```

For multiple speakers:

```text
Speaker A ──► Producer A ──┐
                            │
Speaker B ──► Producer B ──┼──► SFU Router
                            │
Speaker C ──► Producer C ──┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
         Listener A     Listener B     Listener C
```

This matches the V1 requirement that listeners hear all active speakers and that V1 does not require dynamic per-listener speaker subscription.

---

# 16. Media Authorization Boundary

A critical security boundary is:

```text
Application
   ↓
"Is this participant allowed to produce?"
   ↓
YES
   ↓
Media Service
   ↓
SFU
```

Not:

```text
Browser
   ↓
"Here is participantId=X"
   ↓
SFU trusts X
```

The existing `MediaController` already performs identity checks against participant/session information.

That pattern should be retained and completed rather than bypassed.

---

# 17. Media Command Flow

The new realtime commands already represent the right conceptual operations:

```text
media.transport.create
media.transport.connect
media.audio.produce
media.audio.producers
media.audio.consume
```

The intended flow is:

## 17.1 Create Router

Usually room/SFU initialization:

```text
Room
 ↓
Media Router
```

The room gets a media router associated with its active runtime.

---

## 17.2 Create Transport

Client:

```text
media.transport.create
```

Server:

```text
authenticate
    ↓
verify room membership
    ↓
verify participant session
    ↓
create SFU transport
    ↓
return transport parameters
```

---

## 17.3 Connect Transport

Client provides required WebRTC connection information.

Server:

```text
validate connection identity
        ↓
lookup participant's media transport
        ↓
connect transport
        ↓
return success
```

---

## 17.4 Produce Audio

Only an authorized speaker can produce.

```text
room
 ↓
participant
 ↓
audioRole == SPEAKER
 ↓
media transport
 ↓
produce audio
 ↓
SFU Producer
```

If the participant is a listener:

```text
media.audio.produce
        ↓
REJECT
```

The server must enforce this.

---

# 18. Listener Consumption

A listener should receive every active speaker's audio.

The basic flow is:

```text
Join room
   ↓
Get current audio producers
   ↓
For each compatible producer
   ↓
Create consumer
   ↓
Receive audio
```

Then when a new speaker appears:

```text
speaker becomes active
       ↓
producer created
       ↓
room/media event
       ↓
listeners learn about producer
       ↓
consume
```

This means media producer lifecycle and room participant lifecycle need an integration event boundary.

---

# 19. Producer Discovery

The existing:

```text
media.audio.producers
```

command is useful for initial synchronization.

It should not become the only mechanism.

Use:

```text
producer list
```

for initial state.

Use:

```text
realtime events
```

for changes.

Therefore:

```text
JOIN
 ↓
get existing producers
 ↓
consume them
 ↓
listen for new producer events
 ↓
consume new producers
```

---

# 20. Media and Role Changes

A participant changing:

```text
LISTENER → SPEAKER
```

must cause a media lifecycle change.

The sequence is:

```text
Approve speaker
      ↓
application role changes
      ↓
broadcast role change
      ↓
participant now authorized to produce
      ↓
client creates/uses send transport
      ↓
produce audio when user enables microphone
```

Important:

```text
speaker role
      ≠
microphone ON
```

The V1 scope explicitly requires this distinction.

---

# 21. Microphone State

The final system should represent at least:

```text
Speaker authorization
       │
       ├── self-muted
       ├── moderator-muted
       └── actively transmitting
```

A moderator mute must not simply overwrite the participant's own microphone preference.

For example:

```text
selfMute = false
moderatorMute = true

effectiveTransmit = false
```

If moderator mute is removed:

```text
selfMute = false
moderatorMute = false

effectiveTransmit = true
```

The exact detailed state model belongs to implementation design, but the separation itself is required by V1.

---

# 22. Speaker Request Pipeline

The current application already has:

```text
RequestSpeaker
CancelSpeakerRequest
```

but V1 additionally requires approval and denial.

The final flow is:

```text
Listener
   ↓
speaker.request
   ↓
validate listener
   ↓
validate no existing pending request
   ↓
create request
   ↓
persist
   ↓
broadcast request
```

Then:

```text
Moderator
   ↓
speaker.request.approve
   ↓
authorize moderator
   ↓
validate request
   ↓
promote participant to SPEAKER
   ↓
resolve request
   ↓
persist
   ↓
broadcast
```

Or:

```text
Moderator
   ↓
speaker.request.deny
   ↓
authorize moderator
   ↓
resolve request as denied
   ↓
broadcast
```

---

# 23. Speaker Queue Semantics

The queue is:

> visibility + ordering of pending requests.

It is not necessarily a strict FIFO approval mechanism.

Therefore the data model needs:

```text
requestId
participantId
roomId
status
createdAt
resolvedAt
resolvedBy
```

and the application must make moderator choice authoritative.

This follows the V1 scope rather than imposing FIFO behavior that the product did not require.

---

# 24. Moderator Invitation

The V1 invitation flow is:

```text
Host/Co-host
      ↓
invite listener
      ↓
Invitation
      ↓
Listener accepts
      ↓
Listener becomes speaker
      ↓
Microphone remains OFF
      ↓
User explicitly enables microphone
```

This requires:

- invitation repository;
- invitation use cases;
- authorization;
- realtime invitation event;
- accept/decline flow;
- participant promotion;
- media authorization update.

The repository currently has an invitation port but the persistence/application integration is incomplete.

---

# 25. Moderation Flow

Every moderation command must follow:

```text
Connection
   ↓
authenticated user
   ↓
bound participant
   ↓
load authoritative room participant state
   ↓
authorize action
   ↓
perform domain transition
   ↓
persist
   ↓
perform media side effect if required
   ↓
publish event
```

Never:

```text
client claims role
   ↓
handler trusts role
   ↓
mutation
```

---

# 26. Participant Removal

Removal is different from leave.

The V1 distinction is:

```text
Intentional Leave
Temporary Disconnect
Moderator Removal
```

These must not collapse into one `disconnect()` operation.

For removal:

```text
Moderator
   ↓
authorize
   ↓
participant removed
   ↓
role cleared
   ↓
speaker request resolved/invalidated
   ↓
media closed
   ↓
connection terminated
   ↓
participant receives removal result
```

If the participant later rejoins, V1 treats them as a new listener rather than automatically restoring the old elevated role.

---

# 27. Leave Flow

Intentional leave should be explicit.

```text
Client
  ↓
room.leave
  ↓
LeaveRoom
  ↓
mark participant LEFT
  ↓
mark participant session intentionally left
  ↓
close media resources
  ↓
publish participant.left
  ↓
clear connection binding
  ↓
close/retain realtime connection according to protocol
```

The current code has `clearRoomSessionBinding`, but the leave command does not currently complete the binding cleanup.

That must be fixed.

---

# 28. Disconnect Flow

Unexpected connection closure must **not** be treated as intentional leave.

The desired flow is:

```text
WebSocket closes unexpectedly
        ↓
RealtimeRuntime detects close
        ↓
locate bound participant session
        ↓
mark session DISCONNECTED
        ↓
mark participant disconnected/recoverable
        ↓
start/record recovery window
        ↓
publish participant.connection.changed
        ↓
retain logical room participation temporarily
```

The room continues.

The participant is temporarily unavailable.

---

# 29. Reconnection Flow

V1 explicitly requires recovery from temporary failures.

The conceptual flow is:

```text
Old connection
     X
     │
     ▼
Disconnected
     │
     │ recovery window
     ▼
New authenticated connection
     │
     ▼
identify recoverable participant session
     │
     ▼
restore/bind session
     │
     ▼
new connection context
     │
     ▼
restore room participation
     │
     ▼
restore media connectivity
```

The important rule is:

```text
temporary disconnect
       ≠
new participant
```

until the recovery window expires.

The exact timeout and media restoration mechanism are technical decisions, as explicitly left open by the scope.

---

# 30. Reconnection Must Not Restore Everything Blindly

On reconnect:

```text
logical role
```

may be restored.

But:

```text
old WebRTC transports
```

cannot simply be assumed to still exist.

The media layer must determine whether it can:

```text
reuse
```

or:

```text
destroy + recreate
```

media resources.

The safe design is to make media restoration explicit:

```text
participant session recovered
        ↓
media session reconciliation
        ↓
old media resources valid?
     ┌──────┴──────┐
    YES            NO
     │              │
 reuse          recreate
```

The browser should also default to a safe microphone state after recovery.

---

# 31. Host Failure

The room must not be tied to the host WebSocket.

The required behavior is:

```text
Host connection lost
       ↓
Room remains active
       ↓
Host temporarily recoverable
       ↓
If no co-host:
    promote eligible participant
```

The scope specifies:

1. Prefer currently active speakers.
2. Choose the oldest/earliest eligible speaker.
3. If no eligible speaker exists, choose the oldest eligible participant.
4. Promote to co-host.
5. If original host returns during the applicable recovery period:
   - restore host authority;
   - retain existing co-host.

This is product behavior already defined by V1 and must therefore be encoded as application/domain logic rather than left to connection handling.

---

# 32. Host Intentional Leave

Intentional host departure is fundamentally different.

Two operations exist:

```text
END ROOM
```

and:

```text
LEAVE SILENTLY
```

For `END ROOM`:

```text
Room
 ↓
ENDED
 ↓
all participant sessions terminated
 ↓
media closed
 ↓
realtime room closed
```

For `LEAVE SILENTLY`:

```text
Host leaves
 ↓
host participant session ends
 ↓
room remains active
 ↓
eligible delegation applies
```

If the host intentionally leaves and later rejoins, they return as a new participant rather than automatically regaining host role.

This distinction is explicitly required by the scope.

---

# 33. Room Expiry

The domain already contains room duration and expiry-warning concepts.

The missing piece is runtime execution.

The complete chain must be:

```text
Room created
   ↓
expiresAt persisted
   ↓
scheduler/worker checks expiry
   ↓
warning threshold reached
   ↓
publish room.expiry.warning
   ↓
expiry reached
   ↓
EndRoom
   ↓
close participants
   ↓
close media
   ↓
broadcast room.ended
```

This should not rely on the frontend timer.

Frontend timers are presentation.

The server owns actual room expiration.

---

# 34. Empty Room Termination

V1 includes empty-room termination.

Therefore a participant departure/disconnect lifecycle must eventually feed:

```text
room has no active participants
        ↓
empty-room policy
        ↓
end/close room
```

The exact grace behavior must be defined in implementation design if not already specified elsewhere.

The important integration point is:

```text
participant lifecycle
        ↓
room lifecycle evaluation
```

not a separate unrelated timer.

---

# 35. Room End Flow

There should be exactly one application-level room termination path.

```text
EndRoom
   ↓
validate authority / expiry reason
   ↓
end room session
   ↓
mark room ended
   ↓
terminate participant sessions
   ↓
close media
   ↓
publish room.ended
   ↓
notify all connections
   ↓
clear bindings
   ↓
close room connections
```

The existing `EndRoom` use case already moves in this direction.

It needs to become the authoritative termination path for:

```text
host end
expiry
empty-room termination
other server-side termination reasons
```

rather than implementing separate ad-hoc shutdown logic.

---

# 36. Application Layer Completion

The application layer needs to become the complete product behavior layer.

## Existing useful use cases

```text
CreateRoom
JoinRoom
LeaveRoom
EndRoom

RequestSpeaker
CancelSpeakerRequest
```

## Required completion

```text
ApproveSpeakerRequest
DenySpeakerRequest

InviteSpeaker
AcceptSpeakerInvitation
DeclineSpeakerInvitation

PromoteSpeaker
DemoteSpeaker

PromoteCoHost
DemoteCoHost

MuteParticipant
UnmuteParticipant / clear moderator mute

RemoveParticipant

RecoverParticipantSession
DisconnectParticipantSession

GetRoomSnapshot
DiscoverPublicRooms
```

Some names may differ during implementation.

The important requirement is that every V1 action has one application-level authorization/behavior path.

---

# 37. Repository Completion

The application layer already defines repository ports for:

```text
User
Room
Room Session
Participant
Participant Session
Speaker Request
Invitation
```

The DB implementation currently exports only the first five concrete repositories.

Therefore the persistence layer must be completed for:

```text
SpeakerRequestRepository
InvitationRepository
```

and then wired into the application composition root.

Do not implement speaker-request state directly inside realtime handlers.

---

# 38. Transaction Boundaries

Operations that modify multiple durable objects should be transactional.

Examples:

## Joining

```text
Participant
+
Participant Session
```

must be created consistently.

## Speaker approval

Potentially:

```text
Participant role
+
Speaker Request status
```

must remain consistent.

## Participant removal

Potentially:

```text
Participant status
+
Participant session
+
Speaker request
```

must remain coherent.

The repository ports already expose transaction abstractions.

The implementation should use them deliberately rather than creating partial state and attempting compensation later.

---

# 39. Domain vs State Machine

The repository currently has two related concepts:

```text
Domain participant lifecycle
```

and:

```text
Participant state machine
```

This is potentially dangerous if both become authoritative.

The final rule should be:

> **One authority owns business state transitions.**

The state machine can be retained if it represents a formal transition mechanism, but it must not compete with domain methods.

For example, do not allow:

```text
domain says CONNECTED
state machine says RECONNECTING
database says DISCONNECTED
```

without a clearly defined relationship.

A good boundary is:

```text
Domain
 ↓
business-valid state transition

State machine
 ↓
orchestrates/validates connection transition mechanics
```

but the exact ownership must be finalized before implementation.

---

# 40. Realtime Runtime Completion

The realtime runtime should become the only entry point for the new realtime protocol.

Its responsibilities:

```text
Accept connection
      ↓
Authenticate
      ↓
Create session
      ↓
Register connection
      ↓
Route commands
      ↓
Maintain connection context
      ↓
Handle close/error
      ↓
Trigger participant-session lifecycle
      ↓
Unregister connection
```

It should **not** directly implement business rules.

For example:

Bad:

```text
Realtime handler:
if speakers < 10:
    participant.role = speaker
```

Good:

```text
Realtime handler
      ↓
ApproveSpeaker use case
      ↓
domain/application
      ↓
repository
      ↓
event
```

---

# 41. Command Router

The existing command router is the correct architectural direction.

All new commands should flow through:

```text
Envelope validation
        ↓
Command type
        ↓
Command handler
        ↓
Application use case
        ↓
Result/error
        ↓
Realtime response
```

The router should not know domain rules.

---

# 42. Realtime Command Groups

The final command surface should be organized approximately as:

```text
auth.*
room.*
participant.*
speaker.*
moderation.*
media.*
reaction.*
```

For example:

```text
room.join
room.leave
room.end

speaker.request
speaker.request.cancel
speaker.request.approve
speaker.request.deny
speaker.invite
speaker.invite.accept
speaker.invite.decline

participant.mute
participant.demote
participant.remove

media.transport.create
media.transport.connect
media.audio.produce
media.audio.producers
media.audio.consume
```

Exact command names can remain implementation-level decisions.

The architectural rule is more important:

> Each command maps to one explicit application operation.

---

# 43. Event Model

Commands represent:

> "I want to do something."

Events represent:

> "Something happened."

For example:

```text
speaker.request
        ↓
speaker.request.created
```

```text
speaker.request.approve
        ↓
participant.role.changed
speaker.request.resolved
```

```text
participant disconnects
        ↓
participant.connection.changed
```

```text
room ends
        ↓
room.ended
```

Events should be generated from successful state transitions rather than from arbitrary frontend actions.

---

# 44. Media Events

Media-specific events should also be separated from product state.

For example:

```text
media.producer.created
media.producer.closed
media.transport.failed
```

can inform realtime consumers.

But a media failure should not automatically mutate business role state unless the application policy explicitly says so.

Example:

```text
WebRTC transport failed
        ↓
participant remains SPEAKER
        ↓
participant connection/media state becomes unavailable
```

This follows the V1 principle that logical speaker status and active microphone transmission are separate.

---

# 45. Redis/Event Fanout

For a single API process, direct in-memory broadcasting can work.

But the project already contains Redis infrastructure and should use it where it provides a meaningful boundary.

A useful model is:

```text
Application event
       ↓
EventPublisher
       ↓
Redis Pub/Sub
       ↓
Realtime process
       ↓
local ConnectionRegistry
       ↓
room connections
```

This also prepares the architecture for multiple realtime processes without forcing Redis to become the authoritative database.

---

# 46. Current Media Architecture Gap

The repository already contains:

```text
MediaController
MediaService abstraction
Media contract
RPC media service
Unconfigured media service
mediasoup infrastructure
```

This is useful separation.

But the runtime needs one actual path:

```text
Realtime
   ↓
MediaController / application media boundary
   ↓
configured MediaService
   ↓
SFU RPC/local implementation
   ↓
mediasoup
```

There must not be multiple competing media paths such as:

```text
new MediaService
        +
old SfuClient
        +
direct mediasoup calls
```

The active V1 runtime needs exactly one selected media boundary.

---

# 47. Active API Bootstrap Must Be Replaced/Connected

The repository currently contains an older active server bootstrap that:

- creates Express;
- creates a raw WebSocket server;
- handles JSON messages directly;
- starts mediasoup workers.

That bootstrap bypasses the newer:

```text
RealtimeRuntime
CommandRouter
RealtimeAuthenticator
ConnectionContext
Application use cases
```

Therefore this is a major integration blocker.

The final server startup must instead compose:

```text
Config
 ↓
DB
 ↓
Repositories
 ↓
Redis
 ↓
Event publisher
 ↓
Application use cases
 ↓
Media service
 ↓
Realtime authenticator
 ↓
Command handlers
 ↓
Command router
 ↓
Realtime runtime
 ↓
HTTP + WebSocket server
```

The old raw message-processing path should not remain as a second V1 runtime.

---

# 48. Browser Client Must Move to the New Protocol

The current browser sandbox uses an older JSON-RPC-style protocol:

```text
jsonrpc
id
method
params
```

while the new realtime system uses its own command envelope.

Therefore the current client cannot simply be declared the V1 client.

The client needs to speak the final realtime protocol.

The correct implementation sequence is:

```text
Finalize realtime protocol
        ↓
Implement server handlers
        ↓
Update client transport
        ↓
Implement room state synchronization
        ↓
Implement media signaling
```

Do not maintain two protocol systems indefinitely.

---

# 49. Complete Runtime Flow

The entire V1 runtime should ultimately look like this.

```text
                         ┌───────────────┐
                         │    Browser    │
                         └───────┬───────┘
                                 │
                         HTTPS / WebSocket
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   API / Realtime       │
                    │                        │
                    │ Authenticator          │
                    │ Runtime                │
                    │ Session                │
                    │ Router                 │
                    └───────────┬────────────┘
                                │
                         authenticated
                          command
                                │
                                ▼
                    ┌────────────────────────┐
                    │    Application         │
                    │                        │
                    │ Room                   │
                    │ Participant            │
                    │ Speaker Request        │
                    │ Moderation             │
                    │ Session Recovery       │
                    └───────────┬────────────┘
                                │
                   ┌────────────┴────────────┐
                   ▼                         ▼
          ┌─────────────────┐       ┌─────────────────┐
          │   PostgreSQL    │       │     Redis       │
          │                 │       │                 │
          │ durable state   │       │ live/event      │
          │                 │       │ coordination    │
          └─────────────────┘       └────────┬────────┘
                                             │
                                             ▼
                                  ┌─────────────────────┐
                                  │ Realtime Broadcast  │
                                  └─────────┬───────────┘
                                            │
                                            ▼
                                         Browser


                         MEDIA PATH
                         ----------

Browser microphone
       │
       ▼
WebRTC send transport
       │
       ▼
Media service
       │
       ▼
SFU / mediasoup
       │
       ├──────────► Speaker 1 consumer
       ├──────────► Speaker 2 consumer
       └──────────► Speaker N consumer
```

---

# 50. End-to-End Speaker Promotion

A complete speaker promotion must cross all relevant layers.

```text
Listener clicks Raise Hand
        ↓
Realtime command
        ↓
RequestSpeaker
        ↓
DB SpeakerRequest
        ↓
event: request.created
        ↓
Moderator UI updates
        ↓
Moderator approves
        ↓
ApproveSpeakerRequest
        ↓
authorization
        ↓
domain participant transition
        ↓
DB participant update
        ↓
request resolved
        ↓
event: participant.role.changed
        ↓
listener becomes speaker
        ↓
client enables speaker UI
        ↓
user explicitly enables microphone
        ↓
media.transport.create
        ↓
media.transport.connect
        ↓
media.audio.produce
        ↓
SFU producer
        ↓
listeners discover producer
        ↓
listeners consume audio
```

This is the vertical slice that proves the system is actually integrated.

---

# 51. End-to-End Disconnect

```text
Speaker actively talking
        ↓
network failure
        ↓
WebRTC failure / WS failure
        ↓
Realtime runtime detects disconnect
        ↓
participant session = disconnected
        ↓
participant logical state retained
        ↓
room continues
        ↓
other listeners continue hearing other speakers
        ↓
speaker reconnects
        ↓
authenticate
        ↓
recover participant session
        ↓
bind new connection
        ↓
reconcile media
        ↓
new WebRTC transport if required
        ↓
speaker explicitly restores microphone
        ↓
audio resumes
```

The test must verify that the participant does not incorrectly become a brand-new listener during a recoverable failure.

---

# 52. End-to-End Host Failure

```text
Host active
   ↓
host network failure
   ↓
host connection disconnected
   ↓
room remains active
   ↓
existing co-host remains co-host
```

If no co-host:

```text
Host disconnect
      ↓
find eligible speaker
      ↓
oldest eligible speaker
      ↓
promote to co-host
```

If host reconnects:

```text
Host recovery
      ↓
restore host authority
      ↓
existing co-host remains co-host
```

This must be implemented as a deterministic state transition, not as UI behavior.

---

# 53. End-to-End Room End

```text
Host clicks End
      ↓
room.end
      ↓
authorize host
      ↓
EndRoom
      ↓
room/session ended
      ↓
participant sessions terminated
      ↓
media resources closed
      ↓
room.ended event
      ↓
all clients receive event
      ↓
clients leave room UI
      ↓
connections cleaned up
```

Exactly the same application termination path should be reusable by:

```text
expiry
empty-room policy
administrative/system termination
```

with a different reason.

---

# 54. Composition Root

This is where the pieces finally become one system.

The composition root should instantiate:

```text
Configuration
    │
    ├── Database
    │     ├── UserRepository
    │     ├── RoomRepository
    │     ├── RoomSessionRepository
    │     ├── ParticipantRepository
    │     ├── ParticipantSessionRepository
    │     ├── SpeakerRequestRepository
    │     └── InvitationRepository
    │
    ├── Redis
    │
    ├── EventPublisher
    │
    ├── Clock
    ├── IdGenerator
    │
    ├── Application Use Cases
    │
    ├── MediaService
    │
    ├── Authenticator
    │
    ├── Realtime Command Handlers
    │
    ├── CommandRouter
    │
    └── RealtimeRuntime
```

There should be one obvious place where these dependencies are assembled.

That makes the runtime auditable.

---

# 55. What Should Be Removed or Deprecated

The goal is not to preserve every existing implementation.

The following categories should be treated as migration candidates:

## Old WebSocket bootstrap

Replace with the new realtime runtime.

## Old JSON-RPC browser client

Replace with final realtime protocol.

## Old SFU client path

Keep only if it is the selected implementation behind the new media boundary.

## Duplicate participant lifecycle logic

Consolidate.

## Unused abstractions

Remove after confirming no required dependency.

The rule is:

> Existing code earns its place by fitting the V1 architecture, not merely because it already exists.

---

# 56. Implementation Sequence

The implementation should not be done randomly.

Use dependency order.

## Phase 1 — Runtime foundation

Complete:

```text
configuration
database
repositories
Redis
event publisher
authentication
composition root
```

No media yet.

### Gate

Authenticated client can establish a realtime connection.

---

# 57. Phase 2 — Room Vertical Slice

Implement:

```text
Create room
Discover room
Join room
Get snapshot
Leave room
End room
```

Complete:

```text
participant
participant session
connection binding
```

### Gate

Two authenticated clients can:

```text
create
join
see each other
leave
```

without media.

---

# 58. Phase 3 — Realtime State Synchronization

Implement:

```text
room events
participant events
role events
connection events
```

Connect:

```text
Application event
 ↓
Redis/event publisher
 ↓
Realtime broadcast
 ↓
clients
```

### Gate

Multiple clients maintain consistent room state.

---

# 59. Phase 4 — SFU Media Vertical Slice

Implement only:

```text
room
 ↓
media router
 ↓
transport
 ↓
produce
 ↓
consume
```

Initially:

```text
1 speaker
1 listener
```

### Gate

Real microphone audio flows:

```text
Browser A
   ↓
SFU
   ↓
Browser B
```

with measured latency and no manual producer hacks.

---

# 60. Phase 5 — Multi-Speaker Audio

Test:

```text
Speaker A
Speaker B
Speaker C
      ↓
SFU
      ↓
Listener
```

Listener must hear all active speakers.

### Gate

Multiple simultaneous audio tracks work reliably.

This directly validates the V1 media distribution model.

---

# 61. Phase 6 — Speaker Workflow

Implement:

```text
raise hand
request queue
approve
deny
cancel
invite
accept
demote
```

Then connect role state to media authorization.

### Gate

```text
Listener
 ↓
request
 ↓
approve
 ↓
Speaker
 ↓
microphone permission
 ↓
SFU producer
```

works end-to-end.

---

# 62. Phase 7 — Moderation

Implement:

```text
mute
demote
remove
co-host management
host delegation
```

Every action must be server-authorized.

### Gate

Attempt unauthorized actions from a modified client and verify rejection.

---

# 63. Phase 8 — Failure & Recovery

Implement:

```text
temporary disconnect
reconnect
host disconnect
host recovery
speaker disconnect
network transition
browser refresh
stale session
duplicate session
```

### Gate

The failure matrix passes.

This is not optional because failure-aware behavior is a core V1 requirement.

---

# 64. Phase 9 — Room Lifecycle Automation

Implement:

```text
expiry warning
expiry
empty-room termination
```

### Gate

Rooms terminate without frontend participation.

---

# 65. Phase 10 — Observability

Add:

```text
structured logs
room lifecycle metrics
participant lifecycle metrics
connection metrics
reconnection metrics
media errors
SFU health
WebRTC quality metrics
resource metrics
```

The goal is diagnostic visibility, not enterprise observability infrastructure.

---

# 66. Phase 11 — V1 Capacity Validation

Test the actual limits:

```text
10 speakers
50 listeners
```

Do not infer capacity from unit tests.

Measure:

```text
CPU
Memory
Network
Latency
Packet loss
Jitter
Reconnect time
SFU health
Browser behavior
```

The scope explicitly requires capacity validation rather than assumption.

---

# 67. Integration Test Strategy

The most important testing principle is:

> **Every major architectural connection must have an integration test proving both sides actually communicate.**

Not merely:

```text
class exists
```

or:

```text
function returns expected object
```

---

# 68. Layered Tests

## Domain

Test:

```text
room transitions
participant transitions
role rules
capacity rules
moderation authority
```

## Application

Test:

```text
join
leave
speaker approval
moderation
recovery
```

with repositories mocked/faked at the port boundary.

## Repository

Test:

```text
PostgreSQL persistence
transactions
constraints
uniqueness
```

against real PostgreSQL.

## Realtime

Test:

```text
connection
authentication
command routing
binding
events
disconnect handling
```

using real WebSocket connections.

## Media

Test:

```text
router
transport
produce
consume
close
```

against actual mediasoup infrastructure.

---

# 69. Full Runtime Test

The most important test should eventually be:

```text
Browser A
   │
   │ authenticate
   ▼
Realtime
   │
   │ join
   ▼
Application
   │
   ▼
PostgreSQL
   │
   ▼
Participant session
   │
   ▼
Connection binding
   │
   ▼
Media transport
   │
   ▼
SFU
   │
   ▼
Browser B
```

This is the test that proves the system is actually connected.

---

# 70. Audio Pipeline Test Matrix

At minimum:

| Test | Expected result |
|---|---|
| 1 speaker → 1 listener | Audio flows |
| 1 speaker → 5 listeners | All hear audio |
| 5 speakers → 1 listener | Listener hears all |
| 10 speakers → 1 listener | V1 speaker limit works |
| 11th speaker | Rejected |
| 50 listeners | Accepted |
| 51st listener | Rejected |
| Listener produces audio | Rejected |
| Speaker muted | No audio transmission |
| Moderator mutes speaker | Transmission stops |
| Speaker self-unmutes after moderator mute | Still muted |
| Moderator un-mutes | Self-mute state respected |
| Speaker disconnects | Other audio continues |
| Speaker reconnects | Session recoverable |
| Host disconnects | Room continues |
| SFU failure | Defined failure behavior observed |

---

# 71. Regression Protection

Every integration change must be compared against existing behavior.

The workflow should be:

```text
Existing implementation
        ↓
identify useful behavior
        ↓
write/retain tests
        ↓
new implementation
        ↓
run old/new comparison
        ↓
remove obsolete path only after parity
```

Do not delete the old path first and discover later that it contained an undocumented requirement.

---

# 72. Security Test Matrix

Attempt:

```text
Unauthenticated room join
Unauthorized room access
Fake host role
Fake co-host role
Fake participant ID
Produce as listener
Consume unauthorized media
Approve request without permission
Mute without permission
Remove without permission
End room without permission
Duplicate active session
Malformed realtime command
Rate-limit abuse
```

Every one must fail safely.

The V1 scope explicitly requires server-authoritative authorization and protection against malicious clients.

---

# 73. Failure Test Matrix

Test:

```text
Browser refresh
Browser crash
WebSocket disconnect
WebRTC disconnect
Wi-Fi loss
Network transition
Host disconnect
Speaker disconnect
Listener disconnect
SFU failure
API restart
Redis failure
Postgres failure
Duplicate tab
Duplicate device
```

For every scenario record:

```text
What state existed before?
What failure occurred?
What state should result?
What does the client see?
What happens to media?
What happens after recovery?
```

This prevents "reconnection" from becoming an undefined catch-all.

---

# 74. V1 Acceptance Chain

The system should not be declared V1-ready until this complete chain passes:

```text
AUTH
 ↓
CREATE/DISCOVER
 ↓
JOIN
 ↓
SNAPSHOT
 ↓
PARTICIPANT STATE
 ↓
REALTIME EVENTS
 ↓
MEDIA ROUTER
 ↓
TRANSPORT
 ↓
PRODUCE
 ↓
CONSUME
 ↓
MULTIPLE SPEAKERS
 ↓
RAISE HAND
 ↓
APPROVE
 ↓
ROLE CHANGE
 ↓
MEDIA AUTHORIZATION
 ↓
MODERATION
 ↓
DISCONNECT
 ↓
RECONNECT
 ↓
HOST FAILURE
 ↓
ROOM EXPIRY
 ↓
ROOM END
```

Anything missing in this chain is an incomplete V1 runtime.

---

# 75. What Is Already Strong Enough to Reuse

The following repository concepts are structurally valuable and should not be discarded merely for being incomplete:

```text
Domain room model
Domain participant model
Role separation
Capacity policies
Application ports
Repository abstractions
Room lifecycle use cases
Speaker request creation/cancellation
Realtime command router
Connection context
Connection registry
Media contract
Media controller
Media identity validation
PostgreSQL persistence
Redis infrastructure
mediasoup infrastructure
```

They provide useful foundations.

---

# 76. What Must Be Completed

The critical completion list is:

```text
[ ] Real realtime authentication
[ ] Final composition root
[ ] Participant session creation during join
[ ] Connection binding after join
[ ] Binding cleanup on leave
[ ] Disconnect lifecycle integration
[ ] Reconnect/recovery lifecycle
[ ] Speaker request approval
[ ] Speaker request denial
[ ] Invitation persistence
[ ] Invitation application flows
[ ] Moderation use cases
[ ] Role-change event propagation
[ ] Redis/event fanout
[ ] Configured MediaService
[ ] Realtime → Media integration
[ ] Producer lifecycle events
[ ] Client → new realtime protocol
[ ] Room snapshot integration
[ ] Room expiry worker/scheduler
[ ] Empty-room termination
[ ] Host failure/delegation
[ ] Media cleanup on participant lifecycle
[ ] Observability
[ ] Rate limiting
[ ] Full integration tests
[ ] Real audio runtime tests
[ ] V1 capacity tests
```

---

# 77. What Must Not Be Added for V1

Do not let integration work expand into:

```text
video
screen sharing
recording
playback
chat
polls
Q&A
social graph
recommendations
advanced discovery
per-user speaker subscriptions
large-scale broadcasting
server-side audio mixing
multi-device participation
multi-tab participation
```

These are explicitly outside the V1 boundary or deferred.

---

# 78. Final Target Architecture

The final V1 architecture should reduce to this:

```text
                         ┌───────────────────┐
                         │      Browser      │
                         │                   │
                         │ UI + WebRTC       │
                         └─────────┬─────────┘
                                   │
                      HTTPS / WebSocket
                                   │
                                   ▼
                         ┌───────────────────┐
                         │   API Gateway     │
                         │                   │
                         │ HTTP              │
                         │ Realtime          │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Realtime Runtime  │
                         │                   │
                         │ Auth              │
                         │ Connection        │
                         │ Session           │
                         │ Router            │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │   Application     │
                         │                   │
                         │ Room              │
                         │ Participant       │
                         │ Speaker           │
                         │ Moderation        │
                         │ Recovery          │
                         └──────┬─────┬──────┘
                                │     │
                    ┌───────────┘     └───────────┐
                    ▼                             ▼
           ┌─────────────────┐           ┌────────────────┐
           │   PostgreSQL    │           │     Redis      │
           │                 │           │                │
           │ Durable state   │           │ Events/live    │
           └─────────────────┘           └───────┬────────┘
                                                 │
                                                 ▼
                                      ┌────────────────────┐
                                      │ Realtime Fanout    │
                                      └────────────────────┘


                         MEDIA
                         -----

Participant/session
        │
        ▼
 Media authorization
        │
        ▼
   MediaService
        │
        ▼
      SFU
        │
        ├──── producer
        ├──── consumer
        └──── transport
```

---

# 79. The Actual Dependency Graph

Implementation dependencies should therefore be treated as:

```text
Authentication
      ↓
Realtime connection
      ↓
Connection identity
      ↓
Room join
      ↓
Participant
      ↓
Participant session
      ↓
Connection binding
      ↓
Room snapshot
      ↓
Realtime events
      ↓
Media authorization
      ↓
Media router
      ↓
Transport
      ↓
Producer / Consumer
      ↓
Real audio
```

Then:

```text
Participant lifecycle
      ↓
Disconnect/reconnect
      ↓
Media reconciliation
```

and:

```text
Room lifecycle
      ↓
Expiry / empty-room handling
      ↓
Media shutdown
      ↓
Realtime shutdown
```

and:

```text
Speaker workflow
      ↓
Role transition
      ↓
Media authorization
      ↓
Producer lifecycle
```

This is the central integration graph for V1.

---

# 80. The Implementation Principle Going Forward

We should stop thinking about the repository as:

```text
"which files are missing?"
```

and instead work from:

```text
"which runtime transition is currently broken?"
```

For every V1 behavior, trace:

```text
Client action
   ↓
Realtime command
   ↓
Application use case
   ↓
Domain transition
   ↓
Persistence
   ↓
Event
   ↓
Realtime broadcast
   ↓
Media side effect
   ↓
Client state
```

If one arrow does not exist, that feature is not actually integrated.

---

# 81. Immediate Next Implementation Target

The first implementation target should **not** be all V1 features simultaneously.

It should be the first complete vertical runtime:

```text
Authenticated user
       ↓
WebSocket
       ↓
room.join
       ↓
Participant
       ↓
Participant Session
       ↓
Connection Binding
       ↓
Room Snapshot
       ↓
Second User Joins
       ↓
Both Clients Receive Participant Event
       ↓
Leave
       ↓
Correct Participant/Session Cleanup
```

Then immediately extend that same runtime to:

```text
Speaker
   ↓
Media Transport
   ↓
Produce
   ↓
SFU
   ↓
Listener Consume
   ↓
REAL AUDIO
```

Only after this path is real and tested should the project layer on:

```text
speaker requests
moderation
reconnection
host delegation
expiry
observability
capacity
```

That ordering matters because it ensures every later feature is being built on the same actual runtime rather than creating another isolated prototype.

---

# 82. Definition of "Connected"

For this project, a component should be considered **connected** only when all of the following are true:

1. The dependency is instantiated.
2. The runtime can invoke it.
3. The invocation crosses the intended architectural boundary.
4. The result returns correctly.
5. Errors propagate correctly.
6. State changes persist where required.
7. Relevant events are emitted.
8. Other affected clients receive the change.
9. Cleanup works.
10. At least one integration test proves the path.

Therefore:

```text
"MediaService exists"
```

does **not** mean media is integrated.

Instead:

```text
room.join
   ↓
bound participant session
   ↓
media command
   ↓
configured MediaService
   ↓
SFU
   ↓
producer
   ↓
consumer
   ↓
browser audio
```

must work.

Likewise:

```text
"Reconnect state exists"
```

does not mean reconnection works.

It means:

```text
disconnect
 ↓
persist/retain recoverable state
 ↓
new authenticated connection
 ↓
session recovery
 ↓
rebinding
 ↓
media reconciliation
 ↓
state restoration
```

must work.

---

# 83. V1 Completion Definition

ASR Huddle V1 is complete when the architecture is no longer a collection of independently working subsystems.

It must behave as one system:

```text
Identity
   ↕
Room
   ↕
Participant
   ↕
Participant Session
   ↕
Realtime Connection
   ↕
Application State
   ↕
Events
   ↕
Media Session
   ↕
SFU
   ↕
Browser Audio
```

with:

```text
PostgreSQL
    = durable truth

Redis
    = live coordination/fanout

Realtime Runtime
    = connection/protocol boundary

Application
    = business behavior

Domain
    = business invariants/transitions

Media Service
    = media boundary

SFU
    = actual media transport

Browser
    = presentation + WebRTC endpoint
```

That is the target we should implement against.

The existing repository is therefore **not being thrown away**, but it also is **not being preserved unchanged**.

We use the current implementation as raw material, retain what fits the target architecture, complete the missing connections, replace obsolete paths, and prove every important connection through runtime integration tests and actual audio tests.

---

# 84. V1 Integration Checklist

## Foundation

- [ ] One active API bootstrap
- [ ] One realtime runtime
- [ ] One realtime protocol
- [ ] Real authentication
- [ ] Composition root complete
- [ ] DB connected
- [ ] Redis connected
- [ ] Event publisher connected

## Room

- [ ] Create
- [ ] Discover
- [ ] Join
- [ ] Snapshot
- [ ] Leave
- [ ] End
- [ ] Expiry
- [ ] Empty-room handling

## Participant

- [ ] Participant creation
- [ ] Participant session creation
- [ ] Connection binding
- [ ] Connection cleanup
- [ ] Disconnect
- [ ] Recovery
- [ ] Duplicate-session enforcement

## Roles

- [ ] Host
- [ ] Co-host
- [ ] Speaker
- [ ] Listener
- [ ] Promotion
- [ ] Demotion
- [ ] Host delegation
- [ ] Server authorization

## Speaker Workflow

- [ ] Raise hand
- [ ] Queue
- [ ] Cancel
- [ ] Approve
- [ ] Deny
- [ ] Invite
- [ ] Accept
- [ ] Demote

## Media

- [ ] Router
- [ ] Transport
- [ ] Connect
- [ ] Produce
- [ ] Producer discovery
- [ ] Consume
- [ ] Multiple speakers
- [ ] Speaker authorization
- [ ] Self mute
- [ ] Moderator mute
- [ ] Media cleanup
- [ ] Media recovery

## Reliability

- [ ] Participant disconnect
- [ ] Participant reconnect
- [ ] Speaker reconnect
- [ ] Host disconnect
- [ ] Host recovery
- [ ] Host delegation
- [ ] Browser refresh
- [ ] Network transition
- [ ] SFU failure handling

## Operations

- [ ] Structured logs
- [ ] Room metrics
- [ ] Participant metrics
- [ ] Connection metrics
- [ ] WebRTC metrics
- [ ] SFU health
- [ ] Error visibility
- [ ] Capacity measurements

## Validation

- [ ] Real WebSocket integration test
- [ ] Real PostgreSQL integration test
- [ ] Real Redis integration test
- [ ] Real SFU integration test
- [ ] Real browser audio test
- [ ] Multi-speaker test
- [ ] 10-speaker test
- [ ] 50-listener test
- [ ] Failure matrix
- [ ] Security matrix
- [ ] Regression comparison

---

This should now serve as the **integration source of truth for the implementation phase**: instead of fixing files one by one, we can take each broken arrow in the runtime graph and implement/test it until the complete vertical path is executable. The next repo pass should therefore start at the **composition root → authentication → `room.join` → participant session → connection binding**, because that is the foundation on which the actual SFU audio runtime depends.