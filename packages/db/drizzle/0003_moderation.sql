ALTER TABLE "participants"
  ADD COLUMN IF NOT EXISTS "self_muted" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "moderator_muted" integer NOT NULL DEFAULT 0;
