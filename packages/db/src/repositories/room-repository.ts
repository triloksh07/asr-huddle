import { and, eq } from "drizzle-orm";
import type { RoomRepository } from "@repo/application";
import type { RoomState } from "@repo/domain";
import { rooms } from "../schema.js";
import type { Database } from "../client.js";
import { mapRoom } from "../mappers.js";

export class PostgresRoomRepository implements RoomRepository {
  constructor(private readonly database: Database["db"]) {}

  async findById(roomId: string) {
    const row = await this.database.query.rooms.findFirst({
      where: eq(rooms.id, roomId),
    });

    return row ? mapRoom(row) : null;
  }
  async findActivePublic() {
    const rows = await this.database.query.rooms.findMany({ where: and(eq(rooms.status, "ACTIVE"), eq(rooms.visibility, "PUBLIC")) });
    return rows.map(mapRoom);
  }

  async save(room: RoomState): Promise<void> {
    await this.database
      .insert(rooms)
      .values({
        id: room.id,
        hostUserId: room.hostUserId,
        title: room.title ?? 'Untitled room',
        description: room.description ?? '',
        visibility: room.visibility,
        durationMinutes: room.durationMinutes,
        status: room.status,
        createdAt: room.createdAt,
        endedAt: room.endedAt,
      })
      .onConflictDoUpdate({
        target: rooms.id,
        set: {
          hostUserId: room.hostUserId,
          title: room.title ?? 'Untitled room',
          description: room.description ?? '',
          visibility: room.visibility,
          durationMinutes: room.durationMinutes,
          status: room.status,
          endedAt: room.endedAt,
        },
      });
  }
}
