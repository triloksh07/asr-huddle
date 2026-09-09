import type { BoundRoomSession, RealtimeConnectionContext } from "../connection-context";
import { bindRoomSession } from "../connection-context";

/**
 * Binds the authoritative participant/session returned by room.join to the
 * realtime connection. The join use case remains the owner of creation and
 * recovery; this helper only establishes the connection-local identity used
 * by subsequent media and room commands.
 */
export function bindJoinedRoomSession(
  context: RealtimeConnectionContext,
  result: BoundRoomSession,
): BoundRoomSession {
  bindRoomSession(context, result);
  return result;
}
