-- B20.3: enforce V1 single-room participation at the durable database boundary.
-- A participant in DISCONNECTED/LEFT/REMOVED state does not block a later join.
-- The CONNECTED predicate makes the invariant race-safe across API instances.

CREATE UNIQUE INDEX IF NOT EXISTS participants_one_connected_user_global_idx
  ON participants (user_id)
  WHERE status = 'CONNECTED';
