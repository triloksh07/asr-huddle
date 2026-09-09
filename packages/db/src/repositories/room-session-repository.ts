import { and, eq } from "drizzle-orm";
import type { RoomSessionRepository } from "@repo/application";
import type { RoomSessionState } from "@repo/domain";
import { roomSessions } from "../schema.js";
import type { Database } from "../client.js";
import { mapRoomSession } from "../mappers.js";

export class PostgresRoomSessionRepository implements RoomSessionRepository {
  constructor(private readonly database: Database["db"]) {}

  async findActiveByRoomId(roomId: string) {
    const row = await this.database.query.roomSessions.findFirst({
      where: and(
        eq(roomSessions.roomId, roomId),
        eq(roomSessions.status, "ACTIVE"),
      ),
    });

    return row ? mapRoomSession(row) : null;
  }

  async save(session: RoomSessionState): Promise<void> {
    await this.database
      .insert(roomSessions)
      .values({
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        status: session.status,
        expiryWarningIssuedAt: session.expiryWarningIssuedAt,
        endedAt: session.endedAt,
      })
      .onConflictDoUpdate({
        target: roomSessions.id,
        set: {
          status: session.status,
          expiryWarningIssuedAt: session.expiryWarningIssuedAt,
          endedAt: session.endedAt,
        },
      });
  }
}
