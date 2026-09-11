CREATE TYPE "speaker_request_status" AS ENUM ('PENDING','APPROVED','DENIED','CANCELLED');
CREATE TYPE "invitation_status" AS ENUM ('PENDING','ACCEPTED','DECLINED','CANCELLED');
CREATE TABLE "speaker_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_session_id" uuid NOT NULL REFERENCES "room_sessions"("id"),
  "participant_id" uuid NOT NULL REFERENCES "participants"("id"),
  "status" "speaker_request_status" NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz NOT NULL,
  "resolved_at" timestamptz,
  "resolved_by_participant_id" uuid REFERENCES "participants"("id")
);
CREATE INDEX "speaker_requests_participant_status_idx" ON "speaker_requests" ("participant_id","status");
CREATE INDEX "speaker_requests_room_session_status_idx" ON "speaker_requests" ("room_session_id","status");
CREATE UNIQUE INDEX "speaker_requests_one_pending_participant_idx" ON "speaker_requests" ("participant_id") WHERE "status"='PENDING';
CREATE TABLE "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_session_id" uuid NOT NULL REFERENCES "room_sessions"("id"),
  "target_participant_id" uuid NOT NULL REFERENCES "participants"("id"),
  "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz NOT NULL,
  "resolved_at" timestamptz
);
CREATE INDEX "invitations_target_status_idx" ON "invitations" ("target_participant_id","status");
CREATE INDEX "invitations_room_session_status_idx" ON "invitations" ("room_session_id","status");
CREATE UNIQUE INDEX "invitations_one_pending_target_idx" ON "invitations" ("target_participant_id") WHERE "status"='PENDING';
