CREATE TYPE "room_visibility" AS ENUM ('PUBLIC', 'LINK_ONLY');
CREATE TYPE "room_status" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "room_session_status" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "management_role" AS ENUM ('HOST', 'CO_HOST', 'NONE');
CREATE TYPE "audio_role" AS ENUM ('SPEAKER', 'LISTENER');
CREATE TYPE "participant_status" AS ENUM ('CONNECTED', 'DISCONNECTED', 'LEFT', 'REMOVED');
CREATE TYPE "participant_session_status" AS ENUM ('ACTIVE', 'DISCONNECTED', 'CLOSED');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL,
  "avatar_url" varchar(2048),
  "bio" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "host_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "visibility" "room_visibility" NOT NULL,
  "duration_minutes" integer NOT NULL,
  "status" "room_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz
);

CREATE INDEX "rooms_status_created_at_idx"
  ON "rooms" ("status", "created_at");
CREATE INDEX "rooms_host_user_id_idx"
  ON "rooms" ("host_user_id");

CREATE TABLE "room_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "started_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "status" "room_session_status" NOT NULL DEFAULT 'ACTIVE',
  "expiry_warning_issued_at" timestamptz,
  "ended_at" timestamptz
);

CREATE INDEX "room_sessions_room_id_idx"
  ON "room_sessions" ("room_id");
CREATE INDEX "room_sessions_status_expires_at_idx"
  ON "room_sessions" ("status", "expires_at");
CREATE UNIQUE INDEX "room_sessions_one_active_per_room_idx"
  ON "room_sessions" ("room_id")
  WHERE "status" = 'ACTIVE';

CREATE TABLE "participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "room_session_id" uuid NOT NULL REFERENCES "room_sessions"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "management_role" "management_role" NOT NULL DEFAULT 'NONE',
  "audio_role" "audio_role" NOT NULL DEFAULT 'LISTENER',
  "status" "participant_status" NOT NULL DEFAULT 'CONNECTED',
  "joined_at" timestamptz NOT NULL,
  "disconnected_at" timestamptz,
  "left_at" timestamptz,
  "removed_at" timestamptz
);

CREATE INDEX "participants_room_session_status_idx"
  ON "participants" ("room_session_id", "status");
CREATE INDEX "participants_user_id_idx"
  ON "participants" ("user_id");

CREATE TABLE "participant_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "participant_id" uuid NOT NULL REFERENCES "participants"("id"),
  "connection_id" varchar(128) NOT NULL,
  "status" "participant_session_status" NOT NULL DEFAULT 'ACTIVE',
  "connected_at" timestamptz NOT NULL,
  "disconnected_at" timestamptz,
  "intentional_leave" integer NOT NULL DEFAULT 0,
  "recoverable_until" timestamptz,
  "closed_at" timestamptz
);

CREATE INDEX "participant_sessions_participant_status_idx"
  ON "participant_sessions" ("participant_id", "status");
CREATE UNIQUE INDEX "participant_sessions_connection_id_idx"
  ON "participant_sessions" ("connection_id");
