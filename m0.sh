#!/usr/bin/env bash

# Helper: create issue with milestone + labels
create_issue() {
  local title="$1"
  local body="$2"
  local milestone="$3"
  local labels="$4"

  # Build label args: split on spaces
  local label_args=""
  for label in $labels; do
    label_args+=" --label \"$label\""
  done

  # Use eval so label_args expands properly
  eval gh issue create \
    --title "\"$title\"" \
    --body "\"$body\"" \
    --milestone "\"$milestone\"" \
    $label_args
}

# ═══════════════════════════════════════════════════════════════
# M0 — Walking Skeleton (10 issues)
# ═══════════════════════════════════════════════════════════════

create_issue \
  "[TASK] M0-01 Init monorepo + tooling (pnpm, turbo, TS, ESLint, Prettier, Husky)" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → Repository & project structure

**Description:**
- Initialize pnpm workspace with Turborepo
- TypeScript strict mode, shared tsconfig bases
- ESLint (flat config) + Prettier + Husky + commitlint
- Root package.json with turbo pipeline
- pnpm-workspace.yaml (apps/*, packages/*)" \
  "M0 Walking Skeleton" \
  "task,infra,milestone:M0"

create_issue \
  "[TASK] M0-02 Docker Compose for local dev (PG, Redis, Mediasoup, Backend, Frontend, coturn)" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → Development environment

**Description:**
- docker-compose.yml with healthchecks
- postgres:16, redis:7, mediasoup-worker (custom image), coturn (profile)
- backend & frontend dev containers with hot reload
- Volumes for node_modules caching
- .env.example with all required vars" \
  "M0 Walking Skeleton" \
  "task,infra,milestone:M0"

create_issue \
  "[TASK] M0-03 Backend: healthcheck + config + graceful shutdown" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → Backend foundation

**Description:**
- Fastify/Express app with /healthz (checks PG, Redis, Mediasoup worker)
- Zod-validated config (.env → typed object)
- SIGTERM handler: close WS, Mediasoup, PG pool, Redis
- Structured logging (pino) with pretty dev output" \
  "M0 Walking Skeleton" \
  "task,backend,infra,milestone:M0"

create_issue \
  "[TASK] M0-04 Backend: JWT auth stub (login, middleware, refresh)" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → Authentication

**Description:**
- POST /auth/login (mock user DB, argon2id hash)
- Issues HS256 JWT (15m access, 30d refresh)
- Auth middleware validates, attaches req.user
- Refresh endpoint rotates tokens
- WS connection validates token via query param" \
  "M0 Walking Skeleton" \
  "task,backend,auth,milestone:M0"

create_issue \
  "[TASK] M0-05 Backend: Mediasoup worker pool + Router factory" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → Media foundation

**Description:**
- Spawn 1 mediasoup worker per CPU core
- createRoom(roomId) → Router on least-loaded worker
- closeRoom(roomId) cleans up
- Worker crash detection + respawn + room recovery log
- Healthcheck includes worker count" \
  "M0 Walking Skeleton" \
  "task,backend,media,milestone:M0"

create_issue \
  "[TASK] M0-06 Backend: WS server + JSON-RPC 2.0 router + ping/pong" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → Signaling foundation

**Description:**
- ws library on same port as HTTP (upgrade)
- JSON-RPC 2.0 parser: method registry, params validation, error codes
- Ping/pong heartbeat (15s)
- Structured logging per request
- Auth middleware reuses JWT validation" \
  "M0 Walking Skeleton" \
  "task,backend,media,milestone:M0"

create_issue \
  "[TASK] M0-07 Frontend: Vite + React + TS + mediasoup-client setup" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → Frontend foundation

**Description:**
- Vite config handling Mediasoup CJS/ESM
- React 18 + TypeScript strict
- mediasoup-client + @mediapipe/webrtc-adapter
- Auth context (token storage, refresh)
- WS client class with auto-reconnect + JSON-RPC helpers" \
  "M0 Walking Skeleton" \
  "task,frontend,media,milestone:M0"

create_issue \
  "[TASK] M0-08 Frontend: Room list + Create/Join modal + routing" \
  "**Slice:** M0
**Stage-map:** Vertical Feature Development → Slice 1 (Login → Create → Join → Leave)

**Description:**
- Dashboard: paginated list of active public rooms (polling /rooms)
- Create room modal (title, description, duration, visibility)
- Join button → navigates to /room/:id
- React Router setup with protected routes" \
  "M0 Walking Skeleton" \
  "task,frontend,milestone:M0"

create_issue \
  "[TASK] M0-09 Backend: Room lifecycle + Redis session foundation (join/leave, single-session lock)" \
  "**Slice:** M0
**Stage-map:** Vertical Feature Development → Slice 1 continued

**Description:**
- join_room RPC: validates token, room state, single-session lock (Redis SET NX)
- room_state_snapshot (empty producers array)
- leave_room RPC: cleans Redis session, participant set, user_active_session
- participant_joined/left notifications
- Duplicate tab/device rejected with SESSION_CONFLICT" \
  "M0 Walking Skeleton" \
  "task,backend,redis,milestone:M0"

create_issue \
  "[TASK] M0-10 CI pipeline + PR template + dependabot" \
  "**Slice:** M0
**Stage-map:** Implementation Foundation → CI/CD

**Description:**
- GitHub Actions: lint → typecheck → test → build → docker build test
- PR template with DoD checklist
- Dependabot weekly grouped PRs
- Turbo remote caching (optional)
- Artifact upload for build outputs" \
  "M0 Walking Skeleton" \
  "task,ci,milestone:M0"

# ═══════════════════════════════════════════════════════════════
# M1 — Auth & Room CRUD
# ═══════════════════════════════════════════════════════════════

create_issue \
  "[TASK] M1-01 POST /rooms (create) + GET /rooms/active (list) + GET /rooms/:id" \
  "**Slice:** M1
**Description:** REST endpoints for room CRUD. JWT auth required. Creator becomes host. Room ends_at = now + duration_hours. Validation: title ≤100, duration ∈ {1,2,5}, visibility ∈ {public,link_only}." \
  "M1 Auth & Room CRUD" \
  "task,backend,db,milestone:M1"

create_issue \
  "[TASK] M1-02 Room duration timer + 5-min warning + auto-end" \
  "**Slice:** M1
**Description:** Background job (pg_cron or setInterval) checks rooms ending soon. Emits room_ending (300s) → room_ended. Updates room.state = ending/ended. Cleans Redis live state." \
  "M1 Auth & Room CRUD" \
  "task,backend,db,milestone:M1"

create_issue \
  "[TASK] M1-03 Empty room cleanup (no participants → end room)" \
  "**Slice:** M1
**Description:** When last participant leaves, if room.state = active → end room immediately. Emits room_ended. Removes from active Redis sets." \
  "M1 Auth & Room CRUD" \
  "task,backend,redis,milestone:M1"

create_issue \
  "[TASK] M1-04 Room lifecycle events persisted (room_lifecycle_events table)" \
  "**Slice:** M1
**Description:** INSERT on created, host_left, host_delegated, ended, expired, emptied. Payload JSONB with relevant IDs. Index on (room_id, occurred_at DESC)." \
  "M1 Auth & Room CRUD" \
  "task,backend,db,milestone:M1"

# ═══════════════════════════════════════════════════════════════
# M2 — Join/Leave + Presence
# ═══════════════════════════════════════════════════════════════

create_issue \
  "[TASK] M2-01 join_room RPC: full validation + Redis atomic join (Lua)" \
  "**Slice:** M2
**Description:** Lua script atomic_join_room.lua: checks user_active_session, room capacity, assigns role (first=host else listener), creates session hash, updates room sets. Returns {role, isFirst}." \
  "M2 Join/Leave + Presence" \
  "task,backend,redis,milestone:M2"

create_issue \
  "[TASK] M2-02 leave_room RPC + intentional leave cleanup (Lua)" \
  "**Slice:** M2
**Description:** Lua script atomic_leave_room.lua: deletes user_active_session, removes from room sets, cancels pending speaker request, deletes session hash. Broadcasts participant_left (reason=left)." \
  "M2 Join/Leave + Presence" \
  "task,backend,redis,milestone:M2"

create_issue \
  "[TASK] M2-03 room_state_snapshot with active producers + late-join sync" \
  "**Slice:** M2
**Description:** Snapshot includes routerRtpCapabilities, participants[] with {userId, peerId, role, isMuted, producerId}. Late joiner receives all active producerIds → bulk consume." \
  "M2 Join/Leave + Presence" \
  "task,backend,media,milestone:M2"

create_issue \
  "[TASK] M2-04 Frontend: Room view + participant list + connection state UI" \
  "**Slice:** M2
**Description:** Room page shows participants with role badges, mic mute icons, connection state (connected/reconnecting). WS reconnection UI (spinner, toast)." \
  "M2 Join/Leave + Presence" \
  "task,frontend,milestone:M2"

# ═══════════════════════════════════════════════════════════════
# M3 — Listener Audio
# ═══════════════════════════════════════════════════════════════

create_issue \
  "[TASK] M3-01 Backend: create_transport(recv) + consume RPC" \
  "**Slice:** M3
**Description:** RBAC: any role can create recv transport. consume validates producerId exists in room.producers. Returns consumer params. Mediasoup adapter creates WebRtcTransport + Consumer." \
  "M3 Listener Audio" \
  "task,backend,media,milestone:M3"

create_issue \
  "[TASK] M3-02 Frontend: 1 RecvTransport multiplexing + bulk consume" \
  "**Slice:** M3
**Description:** On snapshot, create 1 RecvTransport, then issue consume for each producerId. Attach consumer tracks to <audio> elements. Track map by producerId for cleanup." \
  "M3 Listener Audio" \
  "task,frontend,media,milestone:M3"

create_issue \
  "[TASK] M3-03 VAD: AudioLevelObserver + active_speakers notifications" \
  "**Slice:** M3
**Description:** On room create, attach AudioLevelObserver to Router. On produce, add producer to observer. Throttle volumes events (500ms) → active_speakers notification with {producerId, volume}. Frontend highlights speaker." \
  "M3 Listener Audio" \
  "task,backend,media,milestone:M3"

create_issue \
  "[TASK] M3-04 Opus baseline enforcement (server + client)" \
  "**Slice:** M3
**Description:** Client: setParameters maxBitrate=32000, priority=high. SDP munging for ptime=10, useinbandfec=1, usedtx=1, stereo=0. Server validates producer rtpParameters match baseline." \
  "M3 Listener Audio" \
  "task,media,milestone:M3"

# ═══════════════════════════════════════════════════════════════
# M4 — Speaker Publishing
# ═══════════════════════════════════════════════════════════════

create_issue \
  "[TASK] M4-01 RBAC: create_transport(send) + produce only for speaker/host" \
  "**Slice:** M4
**Description:** Middleware checks session.role ∈ {speaker, host, cohost}. Listener → FORBIDDEN (-32003). create_transport(send) creates WebRtcTransport. produce creates Producer, adds to AudioLevelObserver, stores in room.producers." \
  "M4 Speaker Publishing" \
  "task,backend,media,auth,milestone:M4"

create_issue \
  "[TASK] M4-02 Mic privacy states: mic_self_enabled, mic_moderator_muted" \
  "**Slice:** M4
**Description:** Three flags: role=speaker, micSelfEnabled (user toggle), micModeratorMuted (host action). Effective publishing = role==speaker && micSelfEnabled && !micModeratorMuted. pauseProducer/resumeProducer on mute/unmute. set_mic_state RPC for self-mute." \
  "M4 Speaker Publishing" \
  "task,backend,media,milestone:M4"

create_issue \
  "[TASK] M4-03 Frontend: Mic toggle, mute indicator, permission handling" \
  "**Slice:** M4
**Description:** getUserMedia with constraints (echoCancellation, noiseSuppression, autoGainControl, sampleRate=48000, channelCount=1). Mic button states: off, on, muted-by-host, permission-denied. Request permission on role change to speaker." \
  "M4 Speaker Publishing" \
  "task,frontend,media,milestone:M4"

# ═══════════════════════════════════════════════════════════════
# M5 — Moderation & Queue
# ═══════════════════════════════════════════════════════════════

create_issue \
  "[TASK] M5-01 Speaker request queue (raise/cancel/approve/deny/invite)" \
  "**Slice:** M5
**Description:** Redis sorted set room:{id}:requests (score=position). request_speaker adds entry. cancel removes own. approve/deny/invite by host/cohost. approve → role=speaker, micSelfEnabled=false, broadcast participant_updated + speaker_request_resolved." \
  "M5 Moderation & Queue" \
  "task,backend,redis,milestone:M5"

create_issue \
  "[TASK] M5-02 Moderation actions: mute, demote, remove, promote_cohost" \
  "**Slice:** M5
**Description:** mute_participant → mic_moderator_muted=true + pauseProducer. demote_speaker → role=listener + closeProducer. remove_participant → kick from room (close transports, clean Redis, broadcast left). promote_cohost → max 5, must be speaker, cannot manage other cohosts. All logged to moderation_logs." \
  "M5 Moderation & Queue" \
  "task,backend,redis,milestone:M5"

create_issue \
  "[TASK] M5-03 Host delegation: leave silently → auto-promote oldest speaker/listener" \
  "**Slice:** M5
**Description:** Host leave_silently RPC. If cohosts exist → room continues. Else Lua atomic_promote_cohost.lua: ZRANGE speakers 0 0 → promote to cohost. If no speakers → ZRANGE participants 0 0. Host reconnects within grace → regains host, cohost stays." \
  "M5 Moderation & Queue" \
  "task,backend,redis,milestone:M5"

create_issue \
  "[TASK] M5-04 Host end_room vs leave_silently + cohost permissions" \
  "**Slice:** M5
**Description:** end_room RPC (host only) → room.state=ending → close all transports → broadcast room_ended. leave_silently → host session ends, delegation runs. Cohost can: manage speakers/listeners, mute, demote, remove, invite. Cannot: manage cohosts, end_room." \
  "M5 Moderation & Queue" \
  "task,backend,milestone:M5"

create_issue \
  "[TASK] M5-05 Frontend: Moderation UI (queue, participant actions, host controls)" \
  "**Slice:** M5
**Description:** Queue panel (host/cohost): list pending requests with approve/deny. Participant list: right-click → mute, demote, remove, promote cohost. Host banner: end room / leave silently. Cohost badge." \
  "M5 Moderation & Queue" \
  "task,frontend,milestone:M5"

# ═══════════════════════════════════════════════════════════════
# M6 — Reconnection & Hardening
# ═══════════════════════════════════════════════════════════════

create_issue \
  "[TASK] M6-01 Grace window: 15-30s transport hold on dirty disconnect" \
  "**Slice:** M6
**Description:** On WS close (no leave_room), set session.connectionState=reconnecting, start 15-30s timer (Redis key with TTL). Do NOT close Mediasoup transports. On reconnect with sessionId → cancel timer, bind new WS, emit session_restored." \
  "M6 Reconnection & Hardening" \
  "task,backend,redis,media,milestone:M6"

create_issue \
  "[TASK] M6-02 Client reconnection: sessionId restore + mic off after recovery" \
  "**Slice:** M6
**Description:** Client stores sessionId. On disconnect → RECONNECTING state → auto-reconnect with sessionId. On session_restored → micSelfEnabled=false (safe default). UI shows reconnecting toast." \
  "M6 Reconnection & Hardening" \
  "task,frontend,media,milestone:M6"

create_issue \
  "[TASK] M6-03 Network transition (WiFi→LTE) + browser refresh handling" \
  "**Slice:** M6
**Description:** ICE restart on network change (monitor connectionstatechange). Browser refresh → re-auth → join_room with sessionId → same grace path. Test with Chrome DevTools network throttling." \
  "M6 Reconnection & Hardening" \
  "task,media,milestone:M6"

create_issue \
  "[TASK] M6-04 Rate limiting (room create, speaker request, reactions, signaling)" \
  "**Slice:** M6
**Description:** Redis sliding window: room create 5/min/user, speaker request 10/min, reactions 30/min, signaling 100/s. Return RATE_LIMITED (-32010). Configurable per endpoint." \
  "M6 Reconnection & Hardening" \
  "task,backend,redis,security,milestone:M6"

create_issue \
  "[TASK] M6-05 Observability: structured logs, Prometheus metrics, health endpoints" \
  "**Slice:** M6
**Description:** Pino JSON logs with requestId, userId, roomId. Metrics: room_active, participant_connected, webrtc_publisher, webrtc_subscriber, sfu_cpu, redis_ops_latency, ws_connections. /metrics endpoint. Grafana dashboard JSON." \
  "M6 Reconnection & Hardening" \
  "task,backend,observability,milestone:M6"

create_issue \
  "[TASK] M6-06 Load test: 10 speakers + 50 listeners sustained 30 min" \
  "**Slice:** M6
**Description:** k6 or artillery script: ramp to 60 clients, join, publish/consume audio (silence), random mute/unmute, reconnect 10%. Measure: CPU <70%, p99 E2E latency <150ms, 0% producer/consumer failures. Document results." \
  "M6 Reconnection & Hardening" \
  "task,media,observability,ci,milestone:M6"

create_issue \
  "[TASK] M6-07 TURN/STUN integration + ICE candidate policy" \
  "**Slice:** M6
**Description:** coturn in docker-compose (profile turn). Backend generates turn credentials (short TTL). Client ICE config includes TURN. Test with restrictive NAT (mobile hotspot)." \
  "M6 Reconnection & Hardening" \
  "task,media,infra,milestone:M6"

create_issue \
  "[TASK] M6-08 Security hardening: input validation, CORS, helmet, CSP" \
  "**Slice:** M6
**Description:** Zod schemas on all RPC params. Helmet + CORS (allowlist). CSP for frontend. Sanitize room title/description. Audit JWT claims. Dependency audit (npm audit)." \
  "M6 Reconnection & Hardening" \
  "task,backend,security,milestone:M6"

echo "✅ All issues created. Check GitHub → Issues → Milestones"
