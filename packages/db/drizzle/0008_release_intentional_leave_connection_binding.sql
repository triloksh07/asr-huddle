-- Group 3: an intentional room leave releases the WebSocket connection binding.
-- Temporary disconnects retain their connection_id because reconnect uses it as
-- the optimistic compare-and-claim token.
--
-- The unique index remains in place. PostgreSQL permits multiple NULL values in
-- a unique index, so released connection bindings do not block a later join.

ALTER TABLE participant_sessions
  ALTER COLUMN connection_id DROP NOT NULL;
