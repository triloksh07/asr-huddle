ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email" varchar(320),
  ADD COLUMN IF NOT EXISTS "password_hash" varchar(255);

-- Existing development-only records cannot be safely assigned credentials.
-- Populate them through an explicit migration/administrative flow before
-- enforcing this schema in an environment that already contains users.
ALTER TABLE "users"
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "password_hash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_idx" ON "users" ("email");
