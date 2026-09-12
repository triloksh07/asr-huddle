-- B15: durable-state integrity constraints.
--
-- These indexes enforce invariants at the PostgreSQL boundary so concurrent
-- application instances cannot create states that the application-level
-- preflight checks alone cannot prevent.

CREATE UNIQUE INDEX IF NOT EXISTS participants_one_connected_user_per_session_idx
  ON participants (room_session_id, user_id)
  WHERE status = 'CONNECTED';

CREATE UNIQUE INDEX IF NOT EXISTS participants_one_active_host_per_session_idx
  ON participants (room_session_id)
  WHERE management_role = 'HOST'
    AND status IN ('CONNECTED', 'DISCONNECTED');

CREATE UNIQUE INDEX IF NOT EXISTS participant_sessions_one_active_per_participant_idx
  ON participant_sessions (participant_id)
  WHERE status = 'ACTIVE';
