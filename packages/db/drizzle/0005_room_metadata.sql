ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "title" varchar(100),
  ADD COLUMN IF NOT EXISTS "description" varchar(500);

ALTER TABLE "rooms"
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "description" SET NOT NULL;
